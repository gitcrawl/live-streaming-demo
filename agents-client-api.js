'use strict';
const fetchJsonFile = await fetch("./api.json")
const DID_API = await fetchJsonFile.json()

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;
let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;
let agentId;
let chatId;
let recognition;
let isMessageSent = false; // Flag to track if the message has been sent

const videoElement = document.getElementById('video-element');
videoElement.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');
const streamingStatusLabel = document.getElementById('streaming-status-label');
const agentIdLabel = document.getElementById('agentId-label');
const chatIdLabel = document.getElementById('chatId-label');
const textArea = document.getElementById("textArea");


// Check if the browser supports speech recognition
if ('webkitSpeechRecognition' in window) {
  // Initialize the speech recognition object
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true; // Enable continuous recognition
  recognition.interimResults = false;
  recognition.lang = "en-US";

  // Event handler when recognition starts
  recognition.onstart = function () {
    recordButton.disabled = true;
    recordButton.classList.add("flashing"); // Start flashing when recording starts
    isMessageSent = false; // Reset the flag when recording starts
  };

  // Event handler for results
  recognition.onresult = function (event) {
    const transcript = event.results[event.results.length - 1][0].transcript;
    textArea.value = transcript;

    if (event.results[event.results.length - 1].isFinal) {
      recordButton.classList.remove("flashing"); // Stop flashing when recording stops
      recordButton.disabled = false;

      // Automatically send the message after recording stops
      startButton.click();

      // Set the flag to true to prevent multiple sends
      isMessageSent = true;
    }
  };

  // Event handler for errors
  recognition.onerror = function (event) {
    console.error(event.error);
    recordButton.classList.remove("flashing"); // Stop flashing if there's an error
    recordButton.disabled = false;
  };

  // Event handler when recognition ends
  recognition.onend = function () {
    recordButton.disabled = false;
    // recordButton.classList.remove("flashing"); // Stop flashing when recording ends

    // If you want to restart recognition automatically, uncomment the lines below
    setTimeout(() => {
      if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
        recognition.start();
      }
    }, 1); // Adjust the delay time as needed
  };
} else {
  recordButton.disabled = true;
  alert("Speech recognition not supported in this browser.");
}

const recordButton = document.getElementById('record-button');

recordButton.onclick = function () {
  if (
    peerConnection?.signalingState === "stable" ||
    peerConnection?.iceConnectionState === "connected"
  ) {
    recognition.start();
  } else {
    recordButton.disabled = true;
    alert("Make sure you are connected.");
  }
};

// Play the idle video when the page is loaded
window.onload = (event) => {

  playIdleVideo();

  connectButton.style.backgroundColor = 'red'; // Initialize as red

  if (agentId == "" || agentId == undefined) {
    console.log("Empty 'agentID' and 'chatID' variables\n\n1. Click on the 'Create new Agent with Knowledge' button\n2. Open the Console and wait for the process to complete\n3. Press on the 'Connect' button\n4. Type and send a message to the chat\nNOTE: You can store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats")
  } else {
    console.log("You are good to go!\nClick on the 'Connect Button', Then send a new message\nAgent ID: ", agentId, "\nChat ID: ", chatId)
    agentIdLabel.innerHTML = agentId
    chatIdLabel.innerHTML = chatId //`${chatId}`
  }
}
async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  // Data Channel creation (for dispalying the Agent's responses as text)
  let dc = await peerConnection.createDataChannel("JanusDataChannel");
  dc.onopen = () => {
    console.log("datachannel open");
  };

  let decodedMsg;
  // Agent Text Responses - Decoding the responses, pasting to the HTML element
  dc.onmessage = (event) => {
    let msg = event.data
    let msgType = "chat/answer:"
    if (msg.includes(msgType)) {
      msg = decodeURIComponent(msg.replace(msgType, ""))
      console.log(msg)
      decodedMsg = msg
      //adding save message function
      document.getElementById("msgHistory").innerHTML += `<span style='opacity:0.5'><u>User:</u> ${textArea.value}</span><br>`;
    }
    if (msg.includes("stream/started")) {
      console.log(msg)
      document.getElementById("msgHistory").innerHTML += `<span>${decodedMsg}</span><br><br>`
      //save message history
      saveChatHistory(10000);
    }
    else {
      console.log()
    }
  };

  dc.onclose = () => {
    console.log("datachannel close");
  };

  return sessionClientAnswer;
}
function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    // WEBRTC API CALL 3 - Submit network information
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;

  // Change the connect button color based on the connection state
  if (peerConnection.connectionState === 'connected') {
    connectButton.style.backgroundColor = 'green';
  } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'closed') {
    connectButton.style.backgroundColor = 'red';
  }
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}
function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = 'streaming';

    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    status = 'empty';
    playIdleVideo();
  }
  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = 'streamingState-' + status;
}
function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no video is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks (or clips) endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
     if (report.type === 'inbound-rtp' && report.kind === 'video') {

        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}
function setVideoElement(stream) {
  if (!stream) return;
  // Add Animation Class
  videoElement.classList.add("animated")

  // Removing browsers' autoplay's 'Mute' Requirement
  videoElement.muted = false;

  videoElement.srcObject = stream;
  videoElement.loop = false;

  // Remove Animation Class after it's completed
  setTimeout(() => {
    videoElement.classList.remove("animated")
  }, 1000);

  // safari hotfix
  if (videoElement.paused) {
    videoElement
      .play()
      .then((_) => { })
      .catch((e) => { });
  }
}
function playIdleVideo() {
  // Add Animation Class
  videoElement.classList.toggle("animated")

  videoElement.srcObject = undefined;
  videoElement.src = 'mrgreen4.mp4' //mr green full body
  //'https://agents-results.d-id.com/auth0%7C66551130afa963d3b2c704a4/agt_rXVCHL9a/idle_1723006958521.mp4' //mr green 3
  //'https://agents-results.d-id.com/auth0%7C66551130afa963d3b2c704a4/agt_rhygDU9d/idle_1723001126464.mp4' //mr green 2.0
  // 'https://agents-results.d-id.com/auth0|66551130afa963d3b2c704a4/agt_EQEYgniM/idle_1716856950157.mp4' 
  //'emma_idle.mp4'; //root directory or source url for the mp4 loop file

  videoElement.loop = true;

  // Remove Animation Class after it's completed
  setTimeout(() => {
    videoElement.classList.remove("animated")
  }, 1000);
}
function stopAllStreams() {
  if (videoElement.srcObject) {
    console.log('stopping video streams');
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}
function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  clearInterval(statsIntervalId);
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}
const maxRetryCount = 3;
const maxDelaySec = 4;
async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}

const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  if (agentId == "" || agentId === undefined) {
    return alert("1. Click on the 'Create new Agent with Knowledge' button\n2. Open the Console and wait for the process to complete\n3. Press on the 'Connect' button\n4. Type and send a message to the chat\nNOTE: You can store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats")
  }

  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }
  stopAllStreams();
  closePC();

  // WEBRTC API CALL 1 - Create a new stream //${DID_API.url}/${DID_API.service}/streams
  const sessionResponse = await fetchWithRetries(`https://api.d-id.com/talks/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_url: 'https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_nfx7frIl3Ry1MOXxU8vzi/image.png' //mr green extended
      //'https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_fLumVAg_JINym5itFVCCp/image.png' // mr green 3
      //'https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_-lzagOv-ZsIFBh2mSLTVT/image.png' //mr green
      //'https://create-images-results.d-id.com/DefaultPresenters/Emma_f/v1_image.jpeg'
      //'C:\Users\Tuanng\Desktop\Mr Green VA\live-streaming-demo\emma_idle.png'
      //'emma_idle.png'
      //'https://i.pinimg.com/originals/30/58/3b/30583bd5f852dcdd1cbaeef05b58741c.jpg' //matrix 
      //'https://i.pinimg.com/originals/31/40/91/314091a69b28c1746f0bcb9dfe2db3f5.jpg' //morpheus
      //this is where you can control output of talking image
    }),
  });

  //create new chatID session
  const chatidResponse = await fetchWithRetries(`https://api.d-id.com/agents/agt_EQEYgniM/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
    }),
  });

  // new chat ID define
  const { id: newchatId } = await chatidResponse.json();
  chatId = newchatId;

  // Update the chatId label immediately after setting it
  chatIdLabel.innerHTML = chatId;

// new session ID
  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;
  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  // WEBRTC API CALL 2 - Start a stream
  const sdpResponse = await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
};

const startButton = document.getElementById('start-button');
startButton.onclick = async () => {
  // connectionState not supported in firefox
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    document.getElementById("msgHistory").innerHTML += `<span style='opacity:0.5'><u>User:</u> ${textArea.value}</span><br>`;
  

    // Pasting the user's message to the Chat History element
    document.getElementById("msgHistory").innerHTML += `<span style='opacity:0.5'><u>User:</u> ${textArea.value}</span><br>`

    // Storing the Text Area value
    let txtAreaValue = document.getElementById("textArea").value

    // Clearing the text-box element
    // document.getElementById("textArea").value = ""


    // Agents Overview - Step 3: Send a Message to a Chat session - Send a message to a Chat
    const playResponse = await fetchWithRetries(`${DID_API.url}/agents/${agentId}/chat/${chatId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "streamId": streamId,
        "sessionId": sessionId,
        "messages": [
          {
            "role": "user",
            "content": txtAreaValue,
            "created_at": new Date().toString()
          }
        ]
      }),
    });
    const playResponseData = await playResponse.json();
    if (playResponse.status === 200 && playResponseData.chatMode === 'TextOnly') {
      console.log('User is out of credit, API only return text messages');
      document.getElementById(
        'msgHistory'
      ).innerHTML += `<span style='opacity:0.5'> ${playResponseData.result}</span><br>`;
    }
    setTimeout(clearMessage, 3000);
  }
};

// Adding recording function



// Function to clear the textarea
function clearMessage(){
  textArea.value="";
}

// Function to send the message when "Enter" key is pressed
textArea.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    event.preventDefault(); // Prevent default behavior of adding a new line

    if (textArea.value.trim() !== "") { // Check if the textarea is not empty
      // Display the user's message in the chat history
      // msgHistory.innerHTML += `<span style='opacity:0.5'><u>User:</u> ${textArea.value}</span><br>`;

      // Automatically send the message
      startButton.click();

      // Clear the textarea
      textArea.value = "";
    }
  }
});

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};

// Agents API Workflow
async function agentsAPIworkflow() {
  agentIdLabel.innerHTML = `<span style='color:orange'>Processing...<style='color:orange'>`
  chatIdLabel.innerHTML = `<span style='color:orange'>Processing...<style='color:orange'>`
  axios.defaults.baseURL = `${DID_API.url}`;
  axios.defaults.headers.common['Authorization'] = `Basic ${DID_API.key}`
  axios.defaults.headers.common['content-type'] = 'application/json'

  // Retry Mechanism (Polling) for this demo only - Please use Webhooks in real life applications! 
  // as described in https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-2-add-documents-to-the-knowledge-base
  async function retry(url, retries = 1) {
    const maxRetryCount = 5; // Maximum number of retries
    const maxDelaySec = 10; // Maximum delay in seconds
    try {
      let response = await axios.get(`${url}`)
      if (response.data.status == "done") {
        return console.log(response.data.id + ": " + response.data.status)
      }
      else {
        throw new Error("Status is not 'done'")
      }
    } catch (err) {
      if (retries <= maxRetryCount) {
        const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

        await new Promise((resolve) => setTimeout(resolve, delay));

        console.log(`Retrying ${retries}/${maxRetryCount}. ${err}`);
        return retry(url, retries + 1);
      } else {
        agentIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
        chatIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
        throw new Error(`Max retries exceeded. error: ${err}`);
      }
    }
  }

  // Knowledge Overview - Step 1: Create a new Knowledge Base
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-1-create-a-new-knowledge-base
  const createKnowledge = await axios.post('/knowledge',
    {
      name: "knowledge",
      description: "D-ID Agents API"
    })
  console.log("Create Knowledge:", createKnowledge.data)

  let knowledgeId = createKnowledge.data.id
  console.log("Knowledge ID: " + knowledgeId)

  // Knowledge Overview - Step 2: Add Documents to the Knowledge Base
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-2-add-documents-to-the-knowledge-base

  const createDocument = await axios.post(`/knowledge/${knowledgeId}/documents`,
    {
      "documentType": "pdf",
      "source_url": "https://d-id-public-bucket.s3.us-west-2.amazonaws.com/Prompt_engineering_Wikipedia.pdf",
      "title": "Prompt Engineering Wikipedia Page PDF",
    })
  console.log("Create Document: ", createDocument.data)

  // Split the # to use in documentID
  let documentId = createDocument.data.id
  let splitArr = documentId.split("#")
  documentId = splitArr[1]
  console.log("Document ID: " + documentId)


  // Knowledge Overview - Step 3: Retrieving the Document and Knowledge status
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-3-retrieving-the-document-and-knowledge-status
  await retry(`/knowledge/${knowledgeId}/documents/${documentId}`)
  await retry(`/knowledge/${knowledgeId}`)

  // Agents Overview - Step 1: Create an Agent
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-1-create-an-agent
  const createAgent = await axios.post('/agents',
    {
      "knowledge": {
        "provider": "pinecone",
        "embedder": {
          "provider": "pinecone",
          "model": "ada02"
        },
        "id": knowledgeId
      },
      "presenter": {
        "type": "talk",
        "voice": {
          "type": "microsoft",
          "voice_id": "en-US-JennyMultilingualV2Neural"
        },
          "thumbnail":"https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_nfx7frIl3Ry1MOXxU8vzi/thumbnail.jpeg", //mr green extended
          "source_url": "https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_nfx7frIl3Ry1MOXxU8vzi/image.png" //mr green extended
          //"thumbnail": "https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_-lzagOv-ZsIFBh2mSLTVT/thumbnail.jpeg", //mr green
          //"source_url": "https://create-images-results.d-id.com/auth0|66551130afa963d3b2c704a4/upl_-lzagOv-ZsIFBh2mSLTVT/image.png"
        //"thumbnail": "https://create-images-results.d-id.com/DefaultPresenters/Emma_f/v1_image.jpeg",
        //"source_url": "https://create-images-results.d-id.com/DefaultPresenters/Emma_f/v1_image.jpeg"
         // "thumbnail": "https://i.pinimg.com/originals/30/58/3b/30583bd5f852dcdd1cbaeef05b58741c.jpg", //matrix
          //"source_url" : "https://i.pinimg.com/originals/30/58/3b/30583bd5f852dcdd1cbaeef05b58741c.jpg" 
      },
      "llm": {
        "type": "openai",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "instructions": "The agent is to be friendly and conversational, it feels like chatting to a friend."
      },
      "preview_name": "Mr Green"
    }

  )
  console.log("Create Agent: ", createAgent.data)
  let agentId = createAgent.data.id
  console.log("Agent ID: " + agentId)

  // Agents Overview - Step 2: Create a new Chat session with the Agent
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-2-create-a-new-chat-session-with-the-agent
  const createChat = await axios.post(`/agents/${agentId}/chat`)
  console.log("Create Chat: ", createChat.data)
  let chatId = createChat.data.id
  console.log("Chat ID: " + chatId)

  // Agents Overview - Step 3: Send a Message to a Chat session
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-3--send-a-message-to-a-chat-session
  // The WebRTC steps are called in the functions: 'connectButton.onclick', onIceCandidate(event), 'startButton.onclick'

  console.log("Create new Agent with Knowledge - DONE!\n Press on the 'Connect' button to proceed.\n Store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats")
  agentIdLabel.innerHTML = agentId
  chatIdLabel.innerHTML = chatId
  return { agentId: agentId, chatId: chatId }

}

const agentsButton = document.getElementById("agents-button")
agentsButton.onclick = async () => {
  try{
    const agentsIds = {} = await agentsAPIworkflow()
    console.log(agentsIds)
    agentId = agentsIds.agentId
    chatId = agentsIds.chatId
    return
  }
  catch(err){
    agentIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
    chatIdLabel.innerHTML = `<span style='color:red'>Failed</span>`
    throw new Error(err)
  }
}

// Paste Your Created Agent and Chat IDs Here:
agentId = "agt_Gw7YP_SR"
chatId = `${chatId}` //"cht_dxgmL5kQeLbI0ZY8Gu9IZ"

// Z3JvdW5kY3Jld0BsYXVuY2hwYWRjZW50cmUuY29t:cnqyLbSYQAyH0GtpBxYYs ground crew api
// agt_EQEYgniM mr green ground crew

// dHVhbm5nMDEudG5AZ21haWwuY29t:DUKEq9OFlFc1KixCbq13G google api
// agt_Gw7YP_SR mr green personal



// Initialize speech recognition
if ('webkitSpeechRecognition' in window) {
  const recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = function() {
    console.log("Voice recognition started. Try speaking into the microphone.");
  };

  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript.trim().toLowerCase();
    console.log("You said: " + transcript);

    if (transcript.includes("hello mr green")) {
      triggerVideoPlayback();
    } else if (transcript.includes("connect launchpad")) {
      recognition.onend = function () {
        console.log("Speech recognition ended.");
      };
      triggerConnect();
      }
  };

  recognition.onerror = function(event) {
    console.error("Speech recognition error:", event.error);
  };

  recognition.onend = function() {
    // Restart recognition automatically
    recognition.start();
  };

  // Start the speech recognition
  recognition.start();
} else {
  console.warn("Speech recognition not supported in this browser.");
}

// Function to play the video
function playVideo() {
  if (videoElement2.style.display === "none") {
    stopIdleVideo();
    // Stop the camera stream if it's playing
    if (cameraStream.srcObject) {
      let stream = cameraStream.srcObject;
      stream.getTracks().forEach(track => track.stop());
    }

    // Show and play the video
    videoElement2.style.display = "block";
    videoElement2.play();

    // When the video ends, hide the video element and show the original animation
    videoElement2.onended = function() {
      videoElement2.style.display = "none";
      resumeIdleVideo();
    };
  }
}

function stopIdleVideo() {
  // Hide and stop the idle video
  videoElement.style.display = "none";
  videoElement.pause();
  videoElement.srcObject = null;
}

function resumeIdleVideo() {
  // Resume the idle video
  videoElement2.style.display = "none";
  videoElement.style.display = "block";
  playIdleVideo();
}

function triggerVideoPlayback() {
  // Stop the idle video
  stopIdleVideo();

  // Play the selected video
  videoElement2.style.display = "block";
  videoElement2.play();

  // Listen for the video end event to resume idle video
  videoElement2.onended = () => {
    resumeIdleVideo();
  };
}


// // Function to trigger the connect button and handle post-connection actions
// function triggerConnect() {
//   console.log("Connecting to Launchpad...");
//   connectButton.click(); // Simulates a click on the connect button

//   // Add event listener to check when the connection is established
//   connectButton.addEventListener('click', function() {
//     // Simulate connection status change after a short delay (e.g., 3 seconds)
//     setTimeout(() => {
//       // Assuming connection was successful, change the button color to green
//       connectButton.style.backgroundColor = 'green';

//       // Automatically activate the microphone button after connection
//       activateMicrophone();
//     }, 2000); // Adjust the delay to match the actual connection time
//   });
// }

// Function to activate the microphone button version 1
// function activateMicrophone() {
//   console.log("Activating microphone...");
//   recordButton.click(); // Simulates a click on the microphone button
// }

// // Function to activate the microphone button version 2
// // function activateMicrophone() {
// //   if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
// //     console.log("Activating microphone...");
// //     startSpeechRecognition(); // Start speech recognition automatically
// //   } else {
// //     console.log('Waiting for connection...');
// //     // Retry connection status check after a short delay
// //     setTimeout(activateMicrophone, 2000); // Retry every 2 seconds (adjust as needed)
// //   }
// // }

// Function to activate the microphone button version 3
// function activateMicrophone() {
//   if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
//         console.log("Activating microphone...");
//         recordButton.click(); // Simulates a click on the microphone button
//       } else {
//         console.log('Waiting for connection...');
//         // Retry connection status check after a short delay
//         setTimeout(activateMicrophone, 2000); // Retry every 2 seconds (adjust as needed)
//       }
// }

// Function to activate the microphone button version 4
function activateMicrophone() {
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    console.log("Activating microphone...");

    const checkAndClick = () => {
      if (!recordButton.classList.contains("flashing")) {
        console.log("Microphone not active yet, retrying...");
        recordButton.click(); // Simulates a click on the microphone button

        // Retry after a short delay
        setTimeout(checkAndClick, 2000); // Retry every 2 seconds (adjust as needed)
      } else {
        console.log("Microphone is active and flashing.");
      }
    };

    checkAndClick(); // Start the checking and clicking loop
  } else {
    console.log('Waiting for connection...');
    // Retry connection status check after a short delay
    setTimeout(activateMicrophone, 2000); // Retry every 2 seconds (adjust as needed)
  }
}

// Function to trigger the connect button and handle post-connection actions version 2
function triggerConnect() {
  console.log("Connecting to Launchpad...");
  connectButton.click(); // Simulates a click on the connect button
  activateMicrophone();
}

// // Function to start speech recognition
// function startSpeechRecognition() {
//   if ('webkitSpeechRecognition' in window) {
//     const recognition = new webkitSpeechRecognition();
//     recognition.continuous = true;
//     recognition.interimResults = false;
//     recognition.lang = "en-US";

//     recognition.onstart = function() {
//       recordButton.disabled = true;
//       recordButton.classList.add("flashing"); // Start flashing when recording starts
//       isMessageSent = false; // Reset the flag when recording starts
//     };

//     recognition.onresult = function(event) {
//       if (!isMessageSent) { // Check if the message has been sent already
//         const transcript = event.results[0][0].transcript;
//         textArea.value = transcript;
//         recordButton.classList.remove("flashing"); // Stop flashing when recording stops
//         recordButton.disabled = false;

//         // Automatically send the message after recording stops
//         startButton.click();

//         // Set the flag to true to prevent multiple sends
//         isMessageSent = true;
//       }
//     };

//     recognition.onerror = function(event) {
//       console.error(event.error);
//       recordButton.classList.remove("flashing"); // Stop flashing if there's an error
//       recordButton.disabled = false;
//     };

//     recognition.onend = function() {
//       recordButton.disabled = false;
//       recordButton.classList.remove("flashing"); // Stop flashing when recording ends

//       // Retry activating the microphone after a short delay if it's not flashing
//       setTimeout(() => {
//         if (!recordButton.classList.contains("flashing")) {
//           activateMicrophone();
//         }
//       }, 2000); // Adjust the delay time as needed
//     };

//     recognition.start(); // Start recognition immediately
//   } else {
//     recordButton.disabled = true;
//     alert('Speech recognition not supported in this browser.');
//   }
// }


// // adding save chat history function
// function saveChatHistory() {
//   const chatHistory = document.getElementById('msgHistory').innerHTML;
//   let chatHistory = chatHistoryElement.innerHTML;

//    // Remove HTML tags
//   chatHistory = chatHistory.replace(/<\/?[^>]+(>|$)/g, "");

//    // Convert special HTML entities back to normal text
//   chatHistory = chatHistory.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

//   const blob = new Blob([chatHistory], { type: 'text/plain' });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement('a');
//   a.style.display = 'none';
//   a.href = url;
//   a.download = `chat_history_${new Date().toISOString()}.txt`;

//   document.body.appendChild(a);
//   a.click();

//   URL.revokeObjectURL(url);
// }

// function saveChatHistory() {
//   const chatHistoryElement = document.getElementById('msgHistory');
//   let chatHistory = chatHistoryElement.innerHTML;

//   // Remove HTML tags
//   chatHistory = chatHistory.replace(/<\/?[^>]+(>|$)/g, "");

//   // Convert special HTML entities back to normal text
//   chatHistory = chatHistory.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

//   // Save the plain text
//   const blob = new Blob([chatHistory], { type: 'text/plain' });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement('a');
//   a.style.display = 'none';
//   a.href = url;
//   a.download = `chat_history_${new Date().toISOString()}.txt`;

//   document.body.appendChild(a);
//   a.click();

//   URL.revokeObjectURL(url);
// }

function saveChatHistory(delay) {
  setTimeout(() => {
  const chatHistoryElement = document.getElementById('msgHistory');
  let chatHistory = chatHistoryElement.innerHTML;

   // Remove HTML tags and format the output
   chatHistory = chatHistory
   .replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
   .replace(/User:/g, "\nUser:") // Add a new line before each "User:" label
  //  .replace(/<br>/g, "\n") // Replace <br> tags with new lines
   .replace(/User:(.+)\n/g, "Question:$1\n") // Ensure each user message is followed by a newline
   .replace(/([^\n])Mr\. Green:/g, "\nMr. Green:") // Ensure Mr. Green's responses are on a new line
   .replace(/\n\s*\n/g, '\n\n') // Ensure a clean double new line between exchanges
   .trim(); // Remove leading and trailing whitespace


  // Save the plain text
  const blob = new Blob([chatHistory], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `chat_history_${new Date().toISOString()}.txt`;

  document.body.appendChild(a);
  a.click();

  URL.revokeObjectURL(url);
 }, delay); // Delay is specified in milliseconds
}