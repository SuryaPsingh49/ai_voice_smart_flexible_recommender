from flask import Flask, render_template, request, jsonify
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)

# Store conversation history using a simple dictionary
# In production, use a database or session management
conversation_history = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_recommendation', methods=['POST'])
def get_recommendation():
    # Get form data
    product_category = request.form.get('product_category')
    printing_type = request.form.get('printing_type')
    layer_structure = request.form.get('layer_structure')
    custom_requirements = request.form.get('custom_requirements', '')
    language = request.form.get('language')
    
    # Create a unique session ID using combination of inputs
    session_id = f"{product_category}_{printing_type}_{layer_structure}"
    
    # Determine language prefix for better structure
    lang_prefix = ""
    if language == "Hindi":
        lang_prefix = "निम्नलिखित प्रारूप में उत्तर दें:\n\n"
    
    # Construct prompt for Gemini AI with structured output instructions
    prompt = f"""
    Suggest the best flexible packaging material structure for a {product_category} product 
    using {printing_type} printing with {layer_structure} layers.
    
    Additional requirements: {custom_requirements}.
    
    {lang_prefix}Format your response in clearly marked sections with emojis:
    
    🔹 **RECOMMENDED STRUCTURE:**
    [Provide a detailed layer-by-layer structure with specific materials]
    
    🔹 **MATERIALS DESCRIPTION:**
    [Describe each material used in the structure with their specific properties]
    
    🔹 **KEY PROPERTIES:**
    [List the key properties of this structure as bullet points]
    
    🔹 **BENEFITS FOR THIS APPLICATION:**
    [Explain 3-5 specific benefits for this {product_category} application]
    
    Make sure sections are clearly separated with line breaks and headings are bold.
    Provide the response in {language}.
    """
    
    try:
        # Call Gemini API with updated model name
        model = genai.GenerativeModel('gemini-1.5-pro')
        response = model.generate_content(prompt)
        
        recommendation = response.text
        
        # Store the conversation history
        conversation_history[session_id] = {
            'initial_prompt': prompt,
            'product_category': product_category,
            'printing_type': printing_type,
            'layer_structure': layer_structure,
            'custom_requirements': custom_requirements,
            'language': language,
            'chat': [
                {'role': 'system', 'content': 'Initial recommendation provided.'},
            ]
        }
        
        return jsonify({
            'status': 'success',
            'recommendation': recommendation,
            'session_id': session_id
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        })

@app.route('/ask_question', methods=['POST'])
def ask_question():
    # Get question data
    question = request.form.get('question')
    session_id = request.form.get('session_id')
    language = request.form.get('language')
    
    # Check if session exists
    if session_id not in conversation_history:
        return jsonify({
            'status': 'error',
            'message': 'Session expired or not found. Please get a new recommendation.'
        })
    
    # Get conversation context
    context = conversation_history[session_id]
    
    # Add question to chat history
    context['chat'].append({'role': 'user', 'content': question})
    
    # Prepare prompt for follow-up question
    follow_up_prompt = f"""
    You're a flexible packaging material expert. The user previously received a recommendation for:
    - Product category: {context['product_category']}
    - Printing type: {context['printing_type']}
    - Layer structure: {context['layer_structure']}
    - Custom requirements: {context['custom_requirements']}
    
    Now they have a follow-up question: "{question}"
    
    Answer the question specifically about the packaging recommendation you previously gave, considering all the technical details of the materials, structure, and application.
    
    Format your answer with:
    🔹 **ANSWER:**
    [Your detailed, technically accurate answer]
    
    Be concise but thorough. Provide specific technical information when relevant.
    Respond in {language}.
    """
    
    try:
        # Call Gemini API for the answer
        model = genai.GenerativeModel('gemini-1.5-pro')
        response = model.generate_content(follow_up_prompt)
        
        answer = response.text
        
        # Store the answer in chat history
        context['chat'].append({'role': 'assistant', 'content': answer})
        
        return jsonify({
            'status': 'success',
            'answer': answer
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        })

if __name__ == '__main__':
    app.run(debug=True)