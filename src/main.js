import './style.css';
import { createModel } from 'vosk-browser';

const ESP_IP = "192.168.4.1";

const commandMap = {
    "zero": 0,
    "one": 90,
    "two": 120,
    "three": 150,
    "four": 180,
};

// UI Elements
const micBtn = document.getElementById('mic-button');
const micStatus = document.getElementById('mic-status');
const modeDisplay = document.getElementById('mode-display');
const angleDisplay = document.getElementById('angle-value');
const logOutput = document.getElementById('log-output');

// Progress Bar & ESP Status UI
const progressContainer = document.getElementById('progress-container');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressText = document.getElementById('progress-text');
const espStatusDot = document.getElementById('esp-status-dot');
const espStatusText = document.getElementById('esp-status-text');

let isListening = false;
let model = null;
let recognizer = null;
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;

// Initialize Vosk Model
async function initVosk() {
    try {
        micStatus.textContent = "Loading voice model...";
        micBtn.disabled = true;
        progressContainer.classList.remove('hidden');

        // Simulate progress for transparency
        let progress = 0;
        const progressInterval = setInterval(() => {
            if (progress < 90) {
                // Slower as it gets closer to 90
                progress += (90 - progress) * 0.1;
                progressBarFill.style.width = `${progress}%`;
                if (progress < 30) progressText.textContent = `Downloading model... ${Math.round(progress)}%`;
                else if (progress < 60) progressText.textContent = `Extracting files... ${Math.round(progress)}%`;
                else progressText.textContent = `Initializing Engine... ${Math.round(progress)}%`;
            }
        }, 300);
        
        // Load the model from the public directory (using absolute URL for Blob Worker compatibility)
        const modelUrl = new URL('/model/model.tar.gz', window.location.href).href;
        model = await createModel(modelUrl);
        recognizer = new model.KaldiRecognizer(16000);
        
        clearInterval(progressInterval);
        progressBarFill.style.width = `100%`;
        progressText.textContent = "Ready!";
        setTimeout(() => progressContainer.classList.add('hidden'), 1000);
        
        recognizer.on("result", (message) => {
            const result = message.result;
            if (result && result.text) {
                const text = result.text.toLowerCase().trim();
                logMessage(`Heard: "${text}"`);
                processCommand(text);
            }
        });

        micStatus.textContent = "Tap to speak (Offline Ready)";
        micBtn.disabled = false;
        logMessage("System ready. Vosk AI loaded locally.");
    } catch (e) {
        console.error("Failed to load model:", e);
        micStatus.textContent = "Error loading model.";
        micStatus.classList.add('error-text');
        logMessage(`Failed to load AI model: ${e.message}`, "error");
    }
}

async function toggleListening() {
    if (!model || !recognizer) return;
    
    if (isListening) {
        stopListening();
    } else {
        await startListening();
    }
}

async function startListening() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
                sampleRate: 16000
            },
            video: false
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        
        processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        processorNode.onaudioprocess = (event) => {
            if (isListening) {
                try {
                    // vosk-browser KaldiRecognizer accepts AudioBuffer directly
                    recognizer.acceptWaveform(event.inputBuffer);
                } catch (e) {
                    console.error('Error processing audio chunk', e);
                }
            }
        };
        
        sourceNode.connect(processorNode);
        processorNode.connect(audioContext.destination);
        
        isListening = true;
        micBtn.classList.add('listening');
        micStatus.textContent = "Listening...";
        micStatus.classList.remove('error-text');
        
    } catch (e) {
        console.error("Microphone access error:", e);
        logMessage(`Microphone error: ${e.message}. Are you on HTTP?`, "error");
        micStatus.textContent = "Microphone Blocked";
        micStatus.classList.add('error-text');
    }
}

function stopListening() {
    isListening = false;
    micBtn.classList.remove('listening');
    micStatus.textContent = "Tap to speak (Offline Ready)";
    
    if (processorNode) {
        processorNode.disconnect();
        processorNode = null;
    }
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

async function sendToESP(angle) {
    try {
        logMessage(`Sending angle ${angle}° to ESP...`);
        const url = `http://${ESP_IP}/cmd?servo=1&angle=${angle}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        await fetch(url, { 
            method: 'GET',
            mode: 'no-cors',
            signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        logMessage(`✓ Sent → Servo Angle: ${angle}°`, "success");
    } catch (error) {
        console.error("ESP connection error:", error);
        logMessage("✗ ESP not connected", "error");
        modeDisplay.textContent = "Disconnected";
        modeDisplay.style.color = "var(--error-color)";
    }
}

function processCommand(text) {
    let found = false;
    
    for (const [command, angle] of Object.entries(commandMap)) {
        if (text.includes(command)) {
            logMessage(`Command recognized: ${command} (${angle}°)`, "success");
            modeDisplay.textContent = command.charAt(0).toUpperCase() + command.slice(1);
            modeDisplay.style.color = "var(--text-primary)";
            angleDisplay.textContent = angle;
            sendToESP(angle);
            found = true;
            break;
        }
    }

    if (!found) {
        const numberMap = { "0": 0, "1": 90, "2": 120, "3": 150, "4": 180 };
        for (const [command, angle] of Object.entries(numberMap)) {
            if (text.includes(command)) {
                logMessage(`Command recognized: ${command} (${angle}°)`, "success");
                modeDisplay.textContent = `Mode ${command}`;
                modeDisplay.style.color = "var(--text-primary)";
                angleDisplay.textContent = angle;
                sendToESP(angle);
                found = true;
                break;
            }
        }
    }

    if (!found) {
        logMessage(`Command not recognized`, "error");
    }
}

function logMessage(msg, type = "normal") {
    logOutput.textContent = msg;
    logOutput.className = "log-output";
    if (type === "error") logOutput.classList.add("error-text");
    if (type === "success") logOutput.classList.add("success-text");
}

// Setup Event Listeners
micBtn.addEventListener('click', toggleListening);

// ESP Background Connectivity Check
async function checkESPConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        await fetch(`http://${ESP_IP}/?ping=${Date.now()}`, { 
            method: 'GET',
            mode: 'no-cors',
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        espStatusDot.className = "status-dot connected";
        espStatusText.textContent = "ESP: Connected";
    } catch (e) {
        espStatusDot.className = "status-dot disconnected";
        espStatusText.textContent = "ESP: Disconnected";
    }
}
setInterval(checkESPConnection, 5000);
checkESPConnection();

// Initialize
initVosk();
