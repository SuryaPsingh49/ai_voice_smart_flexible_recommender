document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.getElementById('chat-container');
    const chatHistory = document.getElementById('chat-history');
    const chatInput = document.getElementById('chat-input');
    const sendQuestionBtn = document.getElementById('send-question-btn');
    
    // Session ID to track conversation context
    let currentSessionId = null;
    let currentLanguage = 'English';
    
    // Form submission handler (existing from the original code)
    const form = document.getElementById('packaging-form');
    const submitBtn = document.getElementById('submit-btn');
    const normalText = submitBtn.querySelector('.normal-text');
    const loadingText = submitBtn.querySelector('.loading-text');
    const loadingIndicator = document.getElementById('loading');
    const outputDiv = document.getElementById('recommendation-output');
    const speakBtn = document.getElementById('speak-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    // Enhancement to existing form handler
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Show loading state
        normalText.classList.add('d-none');
        loadingText.classList.remove('d-none');
        loadingIndicator.classList.remove('d-none');
        outputDiv.innerHTML = '';
        speakBtn.disabled = true;
        stopBtn.disabled = true;
        
        // Hide chat container when generating new recommendation
        chatContainer.style.display = 'none';
        
        // Clear chat history
        chatHistory.innerHTML = '';
        
        // Get form data
        const formData = new FormData(form);
        currentLanguage = formData.get('language');
        
        // Send API request
        fetch('/get_recommendation', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            // Hide loading state
            normalText.classList.remove('d-none');
            loadingText.classList.add('d-none');
            loadingIndicator.classList.add('d-none');
            
            if (data.status === 'success') {
                // Display recommendation with enhanced formatting
                outputDiv.innerHTML = `<div class="alert alert-success">
                    <h4 class="alert-heading">Recommendation Ready!</h4>
                </div>
                <div class="recommendation-content">
                    ${formatRecommendation(data.recommendation)}
                </div>`;
                
                // Store session ID for follow-up questions
                currentSessionId = data.session_id;
                
                // Show chat container
                chatContainer.style.display = 'block';
                
                // Enable speak button
                speakBtn.disabled = false;
                stopBtn.disabled = false;
                
                // Add welcome message to chat
                addChatMessage("How can I help answer questions about this packaging recommendation?", 'assistant');
            } else {
                // Show error
                outputDiv.innerHTML = `<div class="alert alert-danger">
                    <h4 class="alert-heading">Error</h4>
                    <p>${data.message || 'Failed to get recommendation. Please try again.'}</p>
                </div>`;
            }
        })
        .catch(error => {
            // Handle error
            normalText.classList.remove('d-none');
            loadingText.classList.add('d-none');
            loadingIndicator.classList.add('d-none');
            
            outputDiv.innerHTML = `<div class="alert alert-danger">
                <h4 class="alert-heading">Error</h4>
                <p>Network error: ${error.message}</p>
            </div>`;
        });
    });
    
    // Send question handler
    sendQuestionBtn.addEventListener('click', sendQuestion);
    
    // Allow Enter key to send questions
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendQuestion();
        }
    });
    
    // Function to send question to backend
    function sendQuestion() {
        const question = chatInput.value.trim();
        
        // Don't send empty questions
        if (!question) return;
        
        // Don't send if no session ID (no recommendation yet)
        if (!currentSessionId) {
            alert('Please get a packaging recommendation first.');
            return;
        }
        
        // Add user message to chat
        addChatMessage(question, 'user');
        
        // Clear input
        chatInput.value = '';
        
        // Add "thinking" message
        const thinkingId = 'thinking-' + Date.now();
        addThinkingMessage(thinkingId);
        
        // Prepare form data for question API
        const formData = new FormData();
        formData.append('question', question);
        formData.append('session_id', currentSessionId);
        formData.append('language', currentLanguage);
        
        // Send question to API
        fetch('/ask_question', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            // Remove thinking message
            removeThinkingMessage(thinkingId);
            
            if (data.status === 'success') {
                // Add assistant response to chat
                addChatMessage(data.answer, 'assistant');
                
                // Scroll to bottom of chat
                chatHistory.scrollTop = chatHistory.scrollHeight;
            } else {
                // Show error in chat
                addChatMessage("Sorry, I encountered an error: " + data.message, 'assistant');
            }
        })
        .catch(error => {
            // Remove thinking message
            removeThinkingMessage(thinkingId);
            
            // Show error in chat
            addChatMessage("Sorry, there was a problem with your request: " + error.message, 'assistant');
        });
    }
    
    // Function to add a message to the chat history
    function addChatMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}-message`;
        
        // Format assistant messages with same styling as recommendations
        if (sender === 'assistant') {
            messageDiv.innerHTML = formatRecommendation(message);
        } else {
            messageDiv.textContent = message;
        }
        
        chatHistory.appendChild(messageDiv);
        
        // Scroll to bottom of chat
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    // Function to add a "thinking" message
    function addThinkingMessage(id) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'chat-message assistant-message thinking';
        thinkingDiv.id = id;
        thinkingDiv.innerHTML = '<i class="bi bi-three-dots"></i> Thinking...';
        chatHistory.appendChild(thinkingDiv);
        
        // Scroll to bottom of chat
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    // Function to remove the "thinking" message
    function removeThinkingMessage(id) {
        const thinkingDiv = document.getElementById(id);
        if (thinkingDiv) {
            thinkingDiv.remove();
        }
    }
    
    // Enhanced formatting for recommendations and answers with better structure
    function formatRecommendation(text) {
        // Add enhanced styling for better readability
        return text
            // Format emoji headings with bootstrap styling
            .replace(/🔹\s*\*\*(.*?):\*\*/g, '<h4 class="mt-4 mb-3 text-primary">$1</h4>')
            // Format other bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Format bullet points
            .replace(/- (.*?)(?=\n|$)/g, '<li>$1</li>')
            // Wrap bullet point lists in ul tags
            .replace(/<li>.*?(?=<h4|$)/gs, match => {
                if (match.includes('<li>')) {
                    return '<ul class="mb-4">' + match + '</ul>';
                }
                return match;
            })
            // Convert newlines to breaks
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
    }
});