from flask import Flask, render_template, request, jsonify
import os
import google.generativeai as genai
from dotenv import load_dotenv
import uuid
import time
from datetime import datetime

# Load environment variables
load_dotenv()

# Get API key and validate
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False  # Maintain response order

# Configure generation parameters for consistent responses
GENERATION_CONFIG = {
    "temperature": 0.3,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192,
}

SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

# Store conversation history (in-memory, consider Redis for production)
conversation_history = {}

def validate_form_data(form_data):
    """Validate required form fields"""
    required_fields = [
        'product_category', 
        'printing_type',
        'layer_structure',
        'packaging_material',
        'packaging_type'
    ]
    
    for field in required_fields:
        if not form_data.get(field):
            return False, f"Missing required field: {field}"
    return True, ""

def construct_base_prompt(form_data, language):
    """Construct the main recommendation prompt with structured sections"""
    lang_prefix = "निम्नलिखित प्रारूप में उत्तर दें:\n\n" if language == "Hindi" else ""
    
    return f"""
    As a senior flexible packaging engineer, recommend the optimal material structure for:
    
    Product Category: {form_data['product_category']}
    Printing Type: {form_data['printing_type']}
    Layer Structure: {form_data['layer_structure']}
    Primary Material: {form_data['packaging_material']}
    Packaging Format: {form_data['packaging_type']}
    Sealing Type: {form_data.get('sealing_type', 'Not specified')}
    Barrier Requirements: {', '.join(form_data.get('barrier_requirements', []))}
    Sustainability Options: {', '.join(form_data.get('sustainability_options', []))}
    Shelf Life: {form_data.get('shelf_life', 'Not specified')}
    Special Features: {', '.join(form_data.get('special_features', []))}
    Production Volume: {form_data.get('production_volume', 'Not specified')}
    Custom Requirements: {form_data.get('custom_requirements', 'None')}

    {lang_prefix}Format your response in these MARKDOWN sections with emojis:
    
    ## 🔹 RECOMMENDED STRUCTURE
    - Layer-by-layer material structure
    - Thickness recommendations
    - Special treatments/additives
    
    ## 🔸 MATERIALS DESCRIPTION
    - Technical properties of each material
    - Compatibility between layers
    - Manufacturing considerations
    
    ## 🔹 KEY PROPERTIES
    - Barrier performance metrics
    - Thermal properties
    - Mechanical strengths
    - Sustainability features
    
    ## 🔸 BENEFITS FOR APPLICATION
    - Product-specific protection
    - Cost-effectiveness
    - Sustainability advantages
    - Market appeal factors
    
    Include technical specifications and industry standards where applicable.
    Use metric units and material science terminology.
    Response language: {language}
    """

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_recommendation', methods=['POST'])
def get_recommendation():
    try:
        # Check for API key before processing
        if not GEMINI_API_KEY:
            return jsonify({
                'status': 'error',
                'message': 'GEMINI_API_KEY environment variable is not set. Please set it in your .env file.'
            }), 500
            
        # Configure API with current key
        genai.configure(api_key=GEMINI_API_KEY)
        
        form_data = request.form.to_dict()
        form_data['barrier_requirements'] = request.form.getlist('barrier_requirements')
        form_data['sustainability_options'] = request.form.getlist('sustainability_options')
        form_data['special_features'] = request.form.getlist('special_features')

        # Validate form data
        is_valid, message = validate_form_data(form_data)
        if not is_valid:
            return jsonify({'status': 'error', 'message': message}), 400

        # Create unique session ID
        session_id = f"{datetime.now().timestamp()}-{uuid.uuid4().hex[:8]}"
        
        # Construct AI prompt
        language = form_data.get('language', 'English')
        prompt = construct_base_prompt(form_data, language)
        
        # Initialize conversation history
        conversation_history[session_id] = {
            'context': form_data,
            'chat_history': [
                {'role': 'system', 'content': 'Initial recommendation generated'},
                {'role': 'assistant', 'content': ''}  # Placeholder for recommendation
            ],
            'timestamp': time.time()
        }

        # Generate recommendation
        try:
            model = genai.GenerativeModel(
                model_name='gemini-1.5-pro',
                generation_config=GENERATION_CONFIG,
                safety_settings=SAFETY_SETTINGS
            )
            
            response = model.generate_content(prompt)
            recommendation = response.text
            
            # Store generated recommendation
            conversation_history[session_id]['chat_history'][1]['content'] = recommendation

            return jsonify({
                'status': 'success',
                'recommendation': recommendation,
                'session_id': session_id
            })
        except Exception as api_error:
            # Handle API-specific errors
            error_message = str(api_error)
            if "API_KEY_INVALID" in error_message or "API key expired" in error_message:
                return jsonify({
                    'status': 'error',
                    'message': 'The Gemini API key is invalid or has expired. Please update your API key in the .env file.'
                }), 401
            else:
                return jsonify({
                    'status': 'error',
                    'message': f"Gemini API error: {error_message}"
                }), 500

    except Exception as e:
        app.logger.error(f"Recommendation error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to generate recommendation: {str(e)}"
        }), 500

@app.route('/ask_question', methods=['POST'])
def ask_question():
    try:
        # Check for API key before processing
        if not GEMINI_API_KEY:
            return jsonify({
                'status': 'error',
                'message': 'GEMINI_API_KEY environment variable is not set. Please set it in your .env file.'
            }), 500
            
        # Configure API with current key
        genai.configure(api_key=GEMINI_API_KEY)
        
        question = request.form.get('question', '').strip()
        session_id = request.form.get('session_id', '').strip()
        language = request.form.get('language', 'English')

        if not question or not session_id:
            return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400

        session = conversation_history.get(session_id)
        if not session:
            return jsonify({'status': 'error', 'message': 'Invalid session'}), 404

        # Construct follow-up prompt with full context
        context = session['context']
        follow_up_prompt = f"""
        Packaging Expert Context:
        - Product: {context['product_category']}
        - Structure: {context['layer_structure']} layers
        - Materials: {context['packaging_material']} base
        - Printing: {context['printing_type']}
        - Barriers: {', '.join(context.get('barrier_requirements', []))}
        - Sustainability: {', '.join(context.get('sustainability_options', []))}
        
        User Question: "{question}"
        
        Required Answer Format:
        - Technical depth with material science principles
        - Reference industry standards (ISO, ASTM)
        - Compare alternatives if relevant
        - Highlight cost-performance tradeoffs
        - Language: {language}
        
        Structure Response As:
        📌 **Key Analysis**: [Core technical explanation]
        🔍 **Considerations**: [Critical factors]
        💡 **Recommendation**: [Expert opinion]
        """

        # Generate answer
        try:
            model = genai.GenerativeModel(
                model_name='gemini-1.5-pro',
                generation_config=GENERATION_CONFIG,
                safety_settings=SAFETY_SETTINGS
            )
            
            response = model.generate_content(follow_up_prompt)
            answer = response.text

            # Update conversation history
            session['chat_history'].extend([
                {'role': 'user', 'content': question},
                {'role': 'assistant', 'content': answer}
            ])

            return jsonify({
                'status': 'success',
                'answer': answer
            })
        except Exception as api_error:
            # Handle API-specific errors
            error_message = str(api_error)
            if "API_KEY_INVALID" in error_message or "API key expired" in error_message:
                return jsonify({
                    'status': 'error',
                    'message': 'The Gemini API key is invalid or has expired. Please update your API key in the .env file.'
                }), 401
            else:
                return jsonify({
                    'status': 'error',
                    'message': f"Gemini API error: {error_message}"
                }), 500

    except Exception as e:
        app.logger.error(f"Question error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to process question: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Provide helpful message about API key status when starting the app
    if not GEMINI_API_KEY:
        print("\n⚠️  WARNING: GEMINI_API_KEY environment variable is not set!")
        print("Please ensure you have created a .env file with your valid API key.")
        print("Example: GEMINI_API_KEY=your_api_key_here\n")
    else:
        print("\n✅ GEMINI_API_KEY is configured. API key found in environment variables.\n")
        
    app.run(debug=True)
