const hostname = window.location.hostname;
const protocol = window.location.protocol;

let apiUrl;

if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Local development
    apiUrl = 'http://localhost:3000/api';
} else if (hostname.includes('lostboydev.app')) {
    // Production domain
    apiUrl = 'https://nexai.lostboydev.app/api';
} else if (hostname.includes('onrender.com')) {
    // Render testing backend
    apiUrl = 'https://nexai-f9g9.onrender.com/api';
} else {
    // Default to same origin
    apiUrl = `${protocol}//${hostname}/api`;
}

window.NEXAI_API_URL = apiUrl;

console.log('[NEXAI Config] API URL:', window.NEXAI_API_URL);
