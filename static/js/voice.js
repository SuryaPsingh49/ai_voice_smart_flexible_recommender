/**
 * Advanced Speech Synthesis Handler
 * Features:
 * - Cross-browser compatibility
 * - Voice selection optimization
 * - Error handling and recovery
 * - Chunked speech for reliability
 * - Chrome bug fixes
 * - Visual feedback
 * - Support for multiple languages
 */
document.addEventListener('DOMContentLoaded', function() {
    const speakBtn = document.getElementById('speak-btn');
    const stopBtn = document.getElementById('stop-btn');
    const outputDiv = document.getElementById('recommendation-output');
    const chatHistory = document.getElementById('chat-history');
    const languageSelect = document.getElementById('language');
    
    // Speech synthesis state
    const state = {
        speaking: false,
        paused: false,
        currentUtterance: null,
        chunkQueue: [],
        chunkIndex: 0,
        intervalHandlers: [],
        voices: []
    };
    
    // Browser detection for special handling
    const browser = {
        isChrome: navigator.userAgent.indexOf("Chrome") > -1,
        isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
        isFirefox: navigator.userAgent.indexOf("Firefox") > -1,
        isEdge: navigator.userAgent.indexOf("Edg") > -1
    };
    
    console.log('Browser detection:', browser);
    
    // Check if speech synthesis is supported
    if (!('speechSynthesis' in window)) {
        console.error('Speech synthesis not supported');
        showError('Your browser does not support speech synthesis. Please try using Chrome, Edge, or Safari.');
        disableSpeechFeatures();
    }
    
    // Initialize speech synthesis
    const speechSynthesis = window.speechSynthesis;
    
    /**
     * Shows an error message to the user
     * @param {string} message - The error message to display
     */
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'speech-error';
        errorDiv.textContent = message;
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '10px';
        errorDiv.style.marginTop = '10px';
        errorDiv.style.border = '1px solid red';
        
        // Add to page in a visible area
        if (outputDiv && outputDiv.parentNode) {
            outputDiv.parentNode.insertBefore(errorDiv, outputDiv.nextSibling);
        } else {
            document.body.appendChild(errorDiv);
        }
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 10000);
        
        console.error(message);
    }
    
    /**
     * Disables speech features in the UI
     */
    function disableSpeechFeatures() {
        if (speakBtn) {
            speakBtn.disabled = true;
            speakBtn.classList.add('disabled');
            speakBtn.title = 'Speech synthesis not available in your browser';
        }
        
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.classList.add('disabled');
        }
    }
    
    /**
     * Loads available voices and caches them
     * @returns {Promise} - Resolves when voices are loaded
     */
    function loadVoices() {
        return new Promise((resolve) => {
            function onVoicesLoaded() {
                state.voices = speechSynthesis.getVoices();
                
                if (state.voices.length === 0) {
                    console.warn('No voices available yet, will retry');
                    setTimeout(onVoicesLoaded, 100);
                    return;
                }
                
                console.log('Voices loaded:', state.voices.length);
                
                // Log all available voices for debugging
                console.log('Available voices:', state.voices.map(v => `${v.name} (${v.lang})`).join(', '));
                
                // Log male voices specifically for debugging
                const maleVoices = state.voices.filter(v => 
                    v.name.toLowerCase().includes('male') || 
                    v.name.includes('Guy') || 
                    v.name.includes('David') || 
                    v.name.includes('Daniel') || 
                    v.name.includes('Thomas') ||
                    v.name.includes('Alex') ||
                    v.name.includes('James') ||
                    v.name.includes('Matthew')
                );
                
                console.log("Male voices:", maleVoices.map(v => `${v.name} (${v.lang})`).join(', '));
                resolve(state.voices);
            }
            
            // Initial attempt to get voices
            state.voices = speechSynthesis.getVoices();
            
            if (state.voices.length > 0) {
                console.log('Voices available immediately');
                onVoicesLoaded();
            } else {
                // Wait for voices to be loaded (Chrome needs this)
                if (speechSynthesis.onvoiceschanged !== undefined) {
                    speechSynthesis.onvoiceschanged = onVoicesLoaded;
                } else {
                    // For browsers that don't support onvoiceschanged
                    setTimeout(onVoicesLoaded, 100);
                }
            }
        });
    }
    
    /**
     * Gets the best voice for a language
     * @param {string} languageCode - The BCP 47 language code
     * @returns {SpeechSynthesisVoice} - The selected voice
     */
    function getVoice(languageCode) {
        // Make sure voices are loaded
        if (state.voices.length === 0) {
            console.warn('No voices loaded when getVoice was called');
            return null;
        }
        
        console.log(`Looking for melodious male voice with language: ${languageCode}`);
        
        // Array of known high-quality male voices to prioritize (across various platforms)
        const preferredMaleVoices = [
            'Google UK English Male', 'Microsoft David', 'Alex',
            'Microsoft Mark', 'Daniel', 'Google US English Male', 
            'Microsoft Guy', 'Nathan', 'James', 'Thomas', 'Matthew'
        ];
        
        // Hindi-specific voices
        const preferredHindiVoices = ['Hemant', 'Ajit', 'Hindi Male'];
        
        // Select preferred voices based on language
        const preferredVoices = languageCode.toLowerCase().startsWith('hi') ? 
            preferredHindiVoices : preferredMaleVoices;
        
        // The language code prefix (e.g., 'en' from 'en-US')
        const langPrefix = languageCode.substring(0, 2).toLowerCase();
        
        // First try to find a preferred male voice that exactly matches the language
        let selectedVoice = state.voices.find(v => 
            preferredVoices.some(name => v.name.includes(name)) && 
            v.lang.toLowerCase() === languageCode.toLowerCase()
        );
        
        // If no exact match, try with language prefix
        if (!selectedVoice) {
            selectedVoice = state.voices.find(v => 
                preferredVoices.some(name => v.name.includes(name)) && 
                v.lang.toLowerCase().startsWith(langPrefix)
            );
        }
        
        // If still no match, try any male-sounding voice in the exact language
        if (!selectedVoice) {
            selectedVoice = state.voices.find(v => 
                (v.name.toLowerCase().includes('male') || 
                 !v.name.toLowerCase().includes('female')) && 
                v.lang.toLowerCase() === languageCode.toLowerCase()
            );
        }
        
        // Try any voice in the exact language
        if (!selectedVoice) {
            selectedVoice = state.voices.find(v => 
                v.lang.toLowerCase() === languageCode.toLowerCase()
            );
        }
        
        // Try any voice with the language prefix
        if (!selectedVoice) {
            selectedVoice = state.voices.find(v => 
                v.lang.toLowerCase().startsWith(langPrefix)
            );
        }
        
        // Last resort - default voice
        if (!selectedVoice && state.voices.length > 0) {
            selectedVoice = state.voices.find(v => v.default) || state.voices[0];
        }
        
        console.log('Selected voice:', selectedVoice ? 
            `${selectedVoice.name} (${selectedVoice.lang})` : 'None available');
        
        return selectedVoice;
    }
    
    /**
     * Shows all available voices in console for debugging
     * @returns {Array} - List of male voices
     */
    function showAvailableVoices() {
        // Make sure voices are loaded
        if (state.voices.length === 0) {
            console.warn('No voices available for listing');
            return [];
        }
        
        console.log("Available voices:");
        
        // Group voices by language
        const voicesByLang = {};
        state.voices.forEach(voice => {
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
        const maleVoices = state.voices.filter(v => 
            v.name.toLowerCase().includes('male') || 
            v.name.includes('Guy') || 
            v.name.includes('David') || 
            v.name.includes('Daniel') || 
            v.name.includes('Thomas') ||
            v.name.includes('Alex') ||
            v.name.includes('James') ||
            !v.name.toLowerCase().includes('female')
        );
        
        console.log("Male voices:", maleVoices.map(v => `${v.name} (${v.lang})`).join(', '));
        
        return maleVoices;
    }
    
    /**
     * Clean up any ongoing speech and timers
     */
    function cleanupSpeech() {
        // Cancel any speech
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        
        // Clear any timers
        state.intervalHandlers.forEach(interval => clearInterval(interval));
        state.intervalHandlers = [];
        
        // Reset state
        state.speaking = false;
        state.paused = false;
        state.currentUtterance = null;
        state.chunkQueue = [];
        state.chunkIndex = 0;
        
        // Remove visual indicators
        document.querySelectorAll('.speaking').forEach(el => {
            el.classList.remove('speaking');
        });
        
        if (speakBtn) {
            speakBtn.classList.remove('active');
        }
    }
    
    /**
     * Enhanced speaking function with improved error handling
     * @param {string} text - Text to speak
     * @param {string} lang - BCP 47 language code
     */
    function speakText(text, lang) {
        // Clean up any ongoing speech
        cleanupSpeech();
        
        // Set state to speaking
        state.speaking = true;
        
        // Set visual feedback
        if (outputDiv) {
            outputDiv.classList.add('speaking');
        }
        
        if (speakBtn) {
            speakBtn.classList.add('active');
        }
        
        // Handle long texts or Hindi specifically with chunking
        if (text.length > 200 || lang === 'hi-IN') {
            console.log('Using chunked speech for long text or Hindi');
            speakInChunks(text, lang);
            return;
        }
        
        try {
            // Create and configure utterance
            const utterance = new SpeechSynthesisUtterance(text);
            state.currentUtterance = utterance;
            utterance.lang = lang;
            
            // Try to set a voice
            const voice = getVoice(lang);
            if (voice) {
                utterance.voice = voice;
            }
            
            // Adjust speech parameters
            utterance.rate = lang.startsWith('hi') ? 0.9 : 0.95; // Slightly slower for clarity
            utterance.pitch = 0.95; // Lower pitch for male voice
            utterance.volume = 1.0;
            
            // Events
            utterance.onend = function() {
                console.log('Speech ended');
                cleanupSpeech();
            };
            
            utterance.onerror = function(e) {
                console.error('Speech error:', e);
                cleanupSpeech();
                showError(`Speech synthesis error: ${e.error || 'Unknown error'}`);
                
                // Try one more time with chunking as fallback
                if (e.error !== 'interrupted' && text.length > 50) {
                    console.log('Retrying with chunked speech after error');
                    setTimeout(() => speakInChunks(text, lang), 500);
                }
            };
            
            // Start speaking with Chrome bug workaround
            setTimeout(() => {
                try {
                    speechSynthesis.speak(utterance);
                    
                    // Set up chrome bug fix
                    setupChromeBugWorkaround();
                } catch (e) {
                    console.error('Exception during speech:', e);
                    cleanupSpeech();
                    showError(`Speech failed to start: ${e.message}`);
                }
            }, 50);
        } catch (e) {
            console.error('Exception setting up speech:', e);
            cleanupSpeech();
            showError(`Failed to initialize speech: ${e.message}`);
        }
    }
    
    /**
     * Set up workaround for Chrome bug where speech stops after ~15 seconds
     */
    function setupChromeBugWorkaround() {
        // Only needed for Chrome-based browsers
        if (browser.isChrome || browser.isEdge) {
            const intervalId = setInterval(function() {
                if (speechSynthesis.speaking && !document.hidden && !state.paused) {
                    console.log('Applying Chrome bug workaround');
                    speechSynthesis.pause();
                    speechSynthesis.resume();
                } else if (!speechSynthesis.speaking && !state.paused) {
                    clearInterval(intervalId);
                    // Remove from our tracking array
                    const index = state.intervalHandlers.indexOf(intervalId);
                    if (index > -1) {
                        state.intervalHandlers.splice(index, 1);
                    }
                }
            }, 10000);
            
            // Add to our tracking array
            state.intervalHandlers.push(intervalId);
        }
    }
    
    /**
     * Improved chunked speech function for longer texts and better reliability
     * @param {string} text - The text to speak
     * @param {string} lang - BCP 47 language code
     */
    function speakInChunks(text, lang) {
        // Set state
        state.speaking = true;
        state.chunkIndex = 0;
        
        // Prepare text - remove HTML tags
        const plainText = text.replace(/<[^>]*>/g, ' ').trim();
        
        if (!plainText) {
            console.warn('Empty text after processing, nothing to speak');
            cleanupSpeech();
            return;
        }
        
        // Determine chunk size based on language and browser
        let maxChunkSize = 200; // Default
        
        if (lang.startsWith('hi')) {
            maxChunkSize = 100; // Smaller chunks for Hindi
        }
        
        if (browser.isSafari) {
            maxChunkSize = Math.floor(maxChunkSize * 0.8); // Safari needs smaller chunks
        }
        
        // Split by natural break points
        const sentenceBreaks = lang.startsWith('hi') ? 
            /([।\u0964])\s*/g : // Hindi sentence markers
            /([.!?])\s*/g;      // English sentence markers
        
        // Split text into sentences
        const rawSentences = plainText.split(sentenceBreaks);
        const sentences = [];
        
        // Regroup with punctuation
        for (let i = 0; i < rawSentences.length; i += 2) {
            let sentence = rawSentences[i];
            if (i + 1 < rawSentences.length) {
                sentence += rawSentences[i + 1];
            }
            if (sentence.trim()) {
                sentences.push(sentence.trim());
            }
        }
        
        // Group sentences into reasonable chunks
        state.chunkQueue = [];
        let currentChunk = '';
        
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            
            if (currentChunk.length + sentence.length > maxChunkSize) {
                if (currentChunk) {
                    state.chunkQueue.push(currentChunk);
                }
                currentChunk = sentence;
            } else {
                currentChunk += sentence + ' ';
            }
        }
        
        if (currentChunk.trim()) {
            state.chunkQueue.push(currentChunk.trim());
        }
        
        console.log(`Speaking in ${state.chunkQueue.length} chunks`);
        
        // Start speaking chunks
        speakNextChunk(lang);
        
        // Monitor progress and recover if needed
        const recoveryInterval = setInterval(function() {
            if (state.speaking && state.chunkIndex < state.chunkQueue.length && 
                !speechSynthesis.speaking && !state.paused) {
                console.log('Speech seems stuck, restarting from chunk', state.chunkIndex);
                speakNextChunk(lang);
            } else if (state.chunkIndex >= state.chunkQueue.length || !state.speaking) {
                clearInterval(recoveryInterval);
                const index = state.intervalHandlers.indexOf(recoveryInterval);
                if (index > -1) {
                    state.intervalHandlers.splice(index, 1);
                }
            }
        }, 5000);
        
        state.intervalHandlers.push(recoveryInterval);
    }
    
    /**
     * Speaks the next chunk in the queue
     * @param {string} lang - BCP 47 language code
     */
    function speakNextChunk(lang) {
        if (!state.speaking || state.chunkIndex >= state.chunkQueue.length) {
            cleanupSpeech();
            return;
        }
        
        const chunk = state.chunkQueue[state.chunkIndex];
        if (!chunk || chunk.trim() === '') {
            // Skip empty chunks
            state.chunkIndex++;
            speakNextChunk(lang);
            return;
        }
        
        try {
            const utterance = new SpeechSynthesisUtterance(chunk);
            state.currentUtterance = utterance;
            utterance.lang = lang;
            
            // Try to set a voice
            const voice = getVoice(lang);
            if (voice) {
                utterance.voice = voice;
            }
            
            // Adjust parameters for better voice quality
            utterance.rate = lang.startsWith('hi') ? 0.9 : 0.95;
            utterance.pitch = 0.95;
            utterance.volume = 1.0;
            
            // Set up the callback for the next chunk
            utterance.onend = function() {
                state.chunkIndex++;
                if (state.chunkIndex < state.chunkQueue.length && state.speaking) {
                    // Add a small pause between chunks for natural sound
                    setTimeout(() => speakNextChunk(lang), 300);
                } else {
                    // All done
                    cleanupSpeech();
                }
            };
            
            utterance.onerror = function(e) {
                console.error('Chunk speech error:', e);
                
                if (e.error === 'interrupted') {
                    // User probably stopped speech, don't continue
                    cleanupSpeech();
                    return;
                }
                
                // Continue with next chunk despite error after a brief pause
                state.chunkIndex++;
                if (state.chunkIndex < state.chunkQueue.length && state.speaking) {
                    setTimeout(() => speakNextChunk(lang), 500);
                } else {
                    cleanupSpeech();
                }
            };
            
            // Speak the chunk
            setTimeout(() => {
                try {
                    speechSynthesis.speak(utterance);
                } catch (e) {
                    console.error('Exception speaking chunk:', e);
                    state.chunkIndex++;
                    if (state.chunkIndex < state.chunkQueue.length) {
                        setTimeout(() => speakNextChunk(lang), 500);
                    } else {
                        cleanupSpeech();
                    }
                }
            }, 50);
            
        } catch (e) {
            console.error('Error creating utterance for chunk:', e);
            state.chunkIndex++;
            if (state.chunkIndex < state.chunkQueue.length) {
                setTimeout(() => speakNextChunk(lang), 500);
            } else {
                cleanupSpeech();
            }
        }
    }
    
    /**
     * Get language code from dropdown selection
     * @returns {string} BCP 47 language code
     */
    function getCurrentLanguageCode() {
        let langCode = 'en-US'; // Default
        
        if (languageSelect) {
            // Get from dropdown if available
            const language = languageSelect.value;
            langCode = language === 'Hindi' ? 'hi-IN' : 'en-US';
        }
        
        return langCode;
    }
    
    /**
     * Speak text content from a DOM element
     * @param {HTMLElement} element - The element with text to speak
     */
    function speakSelectedText(element) {
        if (!element) {
            console.error('No element provided to speak from');
            return;
        }
        
        const langCode = getCurrentLanguageCode();
        const text = element.textContent || element.innerText;
        
        if (!text || text.trim() === '') {
            console.warn('No text to speak');
            return;
        }
        
        console.log('Speaking selected text in', langCode);
        
        // Show available voices in console for debugging
        showAvailableVoices();
        
        // Speak with improved handling
        speakText(text, langCode);
    }
    
    // EVENT HANDLERS
    
    // Speak button handler for main recommendation
    if (speakBtn) {
        speakBtn.addEventListener('click', function() {
            if (!outputDiv) {
                console.error('Output div not found');
                return;
            }
            
            if (state.speaking) {
                // Toggle pause/resume if already speaking
                if (speechSynthesis.speaking) {
                    if (state.paused) {
                        state.paused = false;
                        console.log('Resuming speech');
                        speechSynthesis.resume();
                    } else {
                        state.paused = true;
                        console.log('Pausing speech');
                        speechSynthesis.pause();
                    }
                } else {
                    // If speech isn't active but state says it should be, reset and start over
                    cleanupSpeech();
                    speakSelectedText(outputDiv);
                }
            } else {
                // Start new speech
                speakSelectedText(outputDiv);
            }
        });
    }
    
    // Stop button handler
    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            console.log('Stop button clicked');
            cleanupSpeech();
        });
    }
    
    // Add ability to speak chat messages by clicking on them
    document.addEventListener('click', function(e) {
        // Check if clicked element is an assistant message in the chat
        const assistantMessage = e.target.closest('.assistant-message');
        if (assistantMessage && !assistantMessage.closest('.thinking')) {
            // First stop any ongoing speech
            cleanupSpeech();
            
            // Add visual indicator that this message is being spoken
            assistantMessage.classList.add('speaking');
            
            // Get language
            const langCode = getCurrentLanguageCode();
            
            // Get text and speak
            const text = assistantMessage.textContent || assistantMessage.innerText;
            speakText(text, langCode);
        }
    });
    
    // Handle page visibility changes to ensure speech works when tab becomes visible again
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Page is hidden, maybe pause speech to save resources
            if (state.speaking && speechSynthesis.speaking && !state.paused) {
                console.log('Page hidden, pausing speech');
                state.paused = true;
                speechSynthesis.pause();
            }
        } else {
            // Page is visible again, resume if needed
            if (state.speaking && state.paused) {
                console.log('Page visible again, resuming speech');
                state.paused = false;
                speechSynthesis.resume();
                
                // Re-apply Chrome bug fix
                setupChromeBugWorkaround();
            }
        }
    });
    
    // Handle page unload
    window.addEventListener('beforeunload', function() {
        cleanupSpeech();
    });
    
    // Handle browser sleep/wake
    window.addEventListener('focus', function() {
        // Browser tab might have been inactive
        if (state.speaking && state.paused) {
            console.log('Window focus gained, checking speech status');
            setTimeout(() => {
                if (state.speaking && !speechSynthesis.speaking) {
                    console.log('Speech seems to have stopped while inactive, restarting');
                    if (state.chunkQueue.length > 0 && state.chunkIndex < state.chunkQueue.length) {
                        // Resume chunked speech
                        speakNextChunk(getCurrentLanguageCode());
                    } else if (outputDiv && outputDiv.classList.contains('speaking')) {
                        // Restart main output speech
                        speakSelectedText(outputDiv);
                    }
                }
            }, 300);
        }
    });
    
    // Handle language change
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            if (state.speaking) {
                // If currently speaking, restart with new language
                const speakingElement = document.querySelector('.speaking');
                cleanupSpeech();
                
                if (speakingElement) {
                    setTimeout(() => speakSelectedText(speakingElement), 300);
                }
            }
        });
    }
    
    // INITIALIZATION
    
    // Log browser info
    console.log('Browser:', navigator.userAgent);
    console.log('Speech synthesis available:', 'speechSynthesis' in window);
    
    // Load voices on startup
    loadVoices().then(() => {
        console.log('Speech synthesis initialized with', state.voices.length, 'voices');
    }).catch(err => {
        console.error('Failed to initialize voices:', err);
    });
});
