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
        micStatus.textContent = "Loading offline AI model (40MB)...";
        micBtn.disabled = true;
        
        // Load the model from the public directory
        model = await createModel('/model/model.tar.gz');
        recognizer = new model.KaldiRecognizer(16000);
        
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

// Initialize
initVosk();
