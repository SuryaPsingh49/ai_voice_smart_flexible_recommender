document.addEventListener('DOMContentLoaded', function() {
    const speakBtn = document.getElementById('speak-btn');
    const stopBtn = document.getElementById('stop-btn');
    const outputDiv = document.getElementById('recommendation-output');
    const chatHistory = document.getElementById('chat-history');
    
    // Check if speech synthesis is supported
    if (!('speechSynthesis' in window)) {
        console.error('Speech synthesis not supported');
        // Add an alert to notify users
        alert('Your browser does not support speech synthesis. Please try using Chrome, Edge, or Safari.');
    }
    
    // Initialize speech synthesis
    const speechSynthesis = window.speechSynthesis;
    let speechUtterance = null;
    
    // Initialize voices
    let voices = [];
    
    function loadVoices() {
        voices = speechSynthesis.getVoices();
        console.log('Voices loaded:', voices.length);
        console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`).join(', '));
        
        // Log male voices specifically for debugging
        const maleVoices = voices.filter(v => 
            v.name.includes('Male') || 
            v.name.includes('Guy') || 
            v.name.includes('David') || 
            v.name.includes('Daniel') || 
            v.name.includes('Thomas') ||
            v.name.includes('Alex')
        );
        console.log("Male voices:", maleVoices.map(v => `${v.name} (${v.lang})`).join(', '));
    }
    
    // Chrome needs this to initialize voices
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // Load voices immediately (for Firefox/Safari)
    loadVoices();
    
    // Enhanced voice selection function - prioritize melodious male voices
    function getVoice(languageCode) {
        // Make sure voices are loaded
        if (voices.length === 0) {
            loadVoices();
        }
        
        console.log(`Looking for melodious male voice with language: ${languageCode}`);
        
        // Array of known high-quality male voices to prioritize (across various platforms)
        const preferredMaleVoices = [
            'Google UK English Male', 'Microsoft David', 'Alex', 'Microsoft Mark',
            'Daniel', 'Google US English Male', 'Microsoft Guy', 'Nathan'
        ];
        
        // First try to find a preferred male voice that matches the language
        let maleVoice = voices.find(v => 
            preferredMaleVoices.includes(v.name) && 
            v.lang.toLowerCase().startsWith(languageCode.substring(0, 2).toLowerCase())
        );
        
        // If no specific preferred voice found, try any male voice in the language
        if (!maleVoice) {
            maleVoice = voices.find(v => 
                (v.name.includes('Thomas') || v.name.includes('Guy') || v.name.includes('David') || 
                v.name.includes('Daniel') || v.name.includes('Male')) && 
                v.lang.toLowerCase().startsWith(languageCode.substring(0, 2).toLowerCase())
            );
        }
        
        // Special handling for Hindi male voice
        if (languageCode.toLowerCase().startsWith('hi') && !maleVoice) {
            maleVoice = voices.find(v => v.lang.toLowerCase() === 'hi-in' && !v.name.includes('Female'));
        }
        
        // Fallback to any voice in the correct language
        if (!maleVoice) {
            maleVoice = voices.find(v => v.lang.toLowerCase().startsWith(languageCode.substring(0, 2).toLowerCase()));
        }
        
        // Last resort - just use the first available voice
        if (!maleVoice && voices.length > 0) {
            maleVoice = voices[0];
        }
        
        console.log('Selected voice:', maleVoice ? `${maleVoice.name} (${maleVoice.lang})` : 'None found');
        return maleVoice;
    }
    
    // Function to list all available voices for debugging
    function showAvailableVoices() {
        // Make sure voices are loaded
        if (voices.length === 0) {
            loadVoices();
        }
        
        console.log("Available voices:");
        
        // Group voices by language
        const voicesByLang = {};
        voices.forEach(voice => {
            if (!voicesByLang[voice.lang]) {
                voicesByLang[voice.lang] = [];
            }
            voicesByLang[voice.lang].push(`${voice.name} (${voice.default ? 'Default' : ''})`);
        });
        
        // Log grouped voices
        for (const lang in voicesByLang) {
            console.log(`${lang}:`, voicesByLang[lang].join(', '));
        }
        
        // Return male voices specifically
    const maleVoices = voices.filter(v => 
        v.name.includes('Male') || 
        v.name.includes('Guy') || 
        v.name.includes('David') || 
        v.name.includes('Daniel') || 
        v.name.includes('Thomas')
    );
    
    console.log("Male voices:", maleVoices.map(v => `${v.name} (${v.lang})`).join(', '));
    
    return maleVoices;
}

// Improved speech function with enhanced voice parameters
function speakText(text, lang) {
    // Cancel any ongoing speech
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    // Set visual feedback
    outputDiv.classList.add('speaking');
    speakBtn.classList.add('active');
    
    // For Hindi, we'll use chunking to improve reliability
    if (lang === 'hi-IN') {
        console.log('Using chunked speech for Hindi');
        speakInChunks(text, lang);
    } else {
        // For other languages, use standard approach
        speechUtterance = new SpeechSynthesisUtterance(text);
        speechUtterance.lang = lang;
        
        // Try to set a voice
        const voice = getVoice(lang);
        if (voice) {
            speechUtterance.voice = voice;
        }
        
        // Adjust speech parameters for melodious male voice
        speechUtterance.rate = lang === 'hi-IN' ? 0.92 : 0.95; // Slightly slower for clarity
        speechUtterance.pitch = 0.9; // Lower pitch for male voice
        speechUtterance.volume = 1.0;
        
        // Events
        speechUtterance.onend = function() {
            console.log('Speech ended');
            outputDiv.classList.remove('speaking');
            speakBtn.classList.remove('active');
        };
        
        speechUtterance.onerror = function(e) {
            console.error('Speech error:', e);
            outputDiv.classList.remove('speaking');
            speakBtn.classList.remove('active');
            alert('Speech synthesis error: ' + e.error);
        };
        
        // Start speaking with Chrome bug workaround
        setTimeout(() => {
            speechSynthesis.speak(speechUtterance);
        }, 100);
    }
}

// Improved chunked speech function for longer texts and Hindi language
function speakInChunks(text, lang) {
    // Prepare text - remove HTML tags
    const plainText = text.replace(/<[^>]*>/g, ' ');
    
    // Split by sentences for more natural pauses
    const sentences = plainText.split(/([।.!?])\s+/);
    const chunks = [];
    
    // Group sentences into reasonable chunks (max 100 chars for Hindi, 200 for English)
    const maxChunkSize = lang === 'hi-IN' ? 100 : 200;
    let currentChunk = '';
    
    for (let i = 0; i < sentences.length; i++) {
        if (currentChunk.length + sentences[i].length > maxChunkSize) {
            chunks.push(currentChunk);
            currentChunk = sentences[i];
        } else {
            currentChunk += sentences[i];
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    console.log(`Speaking in ${chunks.length} chunks`);
    
    let chunkIndex = 0;
    
    function speakNextChunk() {
        if (chunkIndex < chunks.length) {
            const chunk = chunks[chunkIndex];
            const utterance = new SpeechSynthesisUtterance(chunk);
            utterance.lang = lang;
            
            // Try to set a voice
            const voice = getVoice(lang);
            if (voice) {
                utterance.voice = voice;
            }
            
            // Adjust parameters for melodious male voice
            utterance.rate = lang === 'hi-IN' ? 0.92 : 0.95;
            utterance.pitch = 0.9; // Lower pitch for male voice
            utterance.volume = 1.0;
            
            // Set up the callback for the next chunk
            utterance.onend = function() {
                chunkIndex++;
                if (chunkIndex < chunks.length) {
                    setTimeout(speakNextChunk, 300); // Small pause between chunks
                } else {
                    // All done
                    outputDiv.classList.remove('speaking');
                    speakBtn.classList.remove('active');
                }
            };
            
            utterance.onerror = function(e) {
                console.error('Chunk speech error:', e);
                // Continue with next chunk despite error
                chunkIndex++;
                if (chunkIndex < chunks.length) {
                    setTimeout(speakNextChunk, 300);
                } else {
                    outputDiv.classList.remove('speaking');
                    speakBtn.classList.remove('active');
                }
            };
            
            // Speak the chunk
            speechSynthesis.speak(utterance);
        }
    }
    
    // Start the first chunk
    speakNextChunk();
    
    // Monitor and restart if needed
    const speakInterval = setInterval(() => {
        if (!speechSynthesis.speaking && chunkIndex < chunks.length) {
            console.log('Speech seems stuck, restarting');
            speakNextChunk();
        } else if (chunkIndex >= chunks.length) {
            clearInterval(speakInterval);
        }
    }, 5000);
}

// Enhanced speak functionality to handle both recommendation and chat responses
function speakSelectedText(element) {
    const language = document.getElementById('language').value;
    const text = element.textContent || element.innerText;
    
    console.log('Speaking selected text');
    console.log('Text language:', language);
    
    // Show available voices in console for debugging
    showAvailableVoices();
    
    // Set language code based on selection
    let langCode = language === 'Hindi' ? 'hi-IN' : 'en-US';
    
    // Speak with improved handling
    speakText(text, langCode);
}

// Speak button handler for main recommendation
speakBtn.addEventListener('click', function() {
    speakSelectedText(outputDiv);
});

// Stop button handler
stopBtn.addEventListener('click', function() {
    console.log('Stop button clicked');
    if (speechSynthesis.speaking) {
        console.log('Cancelling speech');
        speechSynthesis.cancel();
        outputDiv.classList.remove('speaking');
        speakBtn.classList.remove('active');
    }
});

// Add ability to speak chat messages by clicking on them
document.addEventListener('click', function(e) {
    // Check if clicked element is an assistant message in the chat
    if (e.target.closest('.assistant-message') && !e.target.closest('.thinking')) {
        const msgElement = e.target.closest('.assistant-message');
        const language = document.getElementById('language').value;
        let langCode = language === 'Hindi' ? 'hi-IN' : 'en-US';
        
        // Add visual indicator that this message is being spoken
        if (outputDiv.classList.contains('speaking')) {
            outputDiv.classList.remove('speaking');
        }
        
        msgElement.classList.add('speaking');
        
        // Create new utterance for this message
        const text = msgElement.textContent || msgElement.innerText;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode;
        
        // Try to set a voice
        const voice = getVoice(langCode);
        if (voice) {
            utterance.voice = voice;
        }
        
        // Adjust parameters
        utterance.rate = langCode === 'hi-IN' ? 0.92 : 0.95;
        utterance.pitch = 0.9;
        utterance.volume = 1.0;
        
        // Handle end of speech
        utterance.onend = function() {
            msgElement.classList.remove('speaking');
        };
        
        // Cancel any ongoing speech
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        
        // Speak
        speechSynthesis.speak(utterance);
    }
});

// Handle page unload
window.addEventListener('beforeunload', function() {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
});

// Chrome bug fix - speech synthesis stops after ~15 seconds
setInterval(function() {
    if (speechSynthesis.speaking && !document.hidden) {
        speechSynthesis.pause();
        speechSynthesis.resume();
    }
}, 10000);

// Log browser info
console.log('Browser:', navigator.userAgent);
console.log('Speech synthesis available:', 'speechSynthesis' in window);
}); 
            