
const cameraStream = document.getElementById('camera-stream');
const videoElement2 = document.getElementById('video-element2');

// Load the COCO-SSD model
cocoSsd.load().then(model => {
  // Access the camera
  navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    cameraStream.srcObject = stream;
    cameraStream.onloadedmetadata = () => {
      cameraStream.play();
      // detectFrame(cameraStream, model);
    };
  });
});
