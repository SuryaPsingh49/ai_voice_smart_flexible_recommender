from flask import Flask, render_template, request, jsonify, Response, stream_with_context
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
import uuid
import time
from datetime import datetime

# Load environment variables
load_dotenv()

# Validate essential environment variable
if not os.getenv("GEMINI_API_KEY"):
    raise ValueError("GEMINI_API_KEY environment variable not set")

# Configure Gemini API
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False  # Maintain response order

# Configure generation parameters for consistent responses
GENERATION_CONFIG = types.GenerateContentConfig(
    temperature=0.3,
    top_p=0.95,
    top_k=40,
    max_output_tokens=8192,
    response_mime_type="text/plain",
)

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

        # Generate recommendation using Gemini 2.5 Pro
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)]
            )
        ]
        
        response = client.models.generate_content(
            model="gemini-2.5-pro-preview-05-06",
            contents=contents,
            config=GENERATION_CONFIG
        )
        
        recommendation = response.text
        
        # Store generated recommendation
        conversation_history[session_id]['chat_history'][1]['content'] = recommendation

        return jsonify({
            'status': 'success',
            'recommendation': recommendation,
            'session_id': session_id
        })

    except Exception as e:
        app.logger.error(f"Recommendation error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to generate recommendation: {str(e)}"
        }), 500

@app.route('/get_recommendation_stream', methods=['POST'])
def get_recommendation_stream():
    """Stream version of recommendation endpoint for real-time responses"""
    try:
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
        
        # Initialize conversation history with empty placeholder
        conversation_history[session_id] = {
            'context': form_data,
            'chat_history': [
                {'role': 'system', 'content': 'Initial recommendation generated'},
                {'role': 'assistant', 'content': ''}  # Will be filled as stream completes
            ],
            'timestamp': time.time()
        }

        def generate_stream():
            # Send session ID first
            yield f"data: {{'session_id': '{session_id}'}}\n\n"
            
            full_response = ""
            
            # Generate recommendation using Gemini 2.5 Pro with streaming
            contents = [
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)]
                )
            ]
            
            stream = client.models.generate_content_stream(
                model="gemini-2.5-pro-preview-05-06",
                contents=contents,
                config=GENERATION_CONFIG
            )
            
            for chunk in stream:
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {chunk.text}\n\n"
            
            # Store complete response in history once streaming is done
            conversation_history[session_id]['chat_history'][1]['content'] = full_response
            
            # Signal end of stream
            yield "data: [DONE]\n\n"
            
        return Response(stream_with_context(generate_stream()), 
                        content_type='text/event-stream')

    except Exception as e:
        app.logger.error(f"Streaming recommendation error: {str(e)}")
        return Response(f"data: {{'status': 'error', 'message': 'Failed to generate recommendation: {str(e)}'}}\n\n", 
                      content_type='text/event-stream')

@app.route('/ask_question', methods=['POST'])
def ask_question():
    try:
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

        # Generate answer using Gemini 2.5 Pro
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=follow_up_prompt)]
            )
        ]
        
        response = client.models.generate_content(
            model="gemini-2.5-pro-preview-05-06",
            contents=contents,
            config=GENERATION_CONFIG
        )
        
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

    except Exception as e:
        app.logger.error(f"Question error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to process question: {str(e)}"
        }), 500

@app.route('/ask_question_stream', methods=['POST'])
def ask_question_stream():
    """Stream version of question endpoint for real-time responses"""
    try:
        question = request.form.get('question', '').strip()
        session_id = request.form.get('session_id', '').strip()
        language = request.form.get('language', 'English')

        if not question or not session_id:
            return jsonify({'status': 'error', 'message': 'Missing parameters'}), 400

        session = conversation_history.get(session_id)
        if not session:
            return jsonify({'status': 'error', 'message': 'Invalid session'}), 404

        # Add user question to history immediately
        session['chat_history'].append({'role': 'user', 'content': question})

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

        def generate_stream():
            full_response = ""
            
            # Generate answer using Gemini 2.5 Pro with streaming
            contents = [
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=follow_up_prompt)]
                )
            ]
            
            stream = client.models.generate_content_stream(
                model="gemini-2.5-pro-preview-05-06",
                contents=contents,
                config=GENERATION_CONFIG
            )
            
            for chunk in stream:
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {chunk.text}\n\n"
            
            # Store complete response in history once streaming is done
            session['chat_history'].append({'role': 'assistant', 'content': full_response})
            
            # Signal end of stream
            yield "data: [DONE]\n\n"
            
        return Response(stream_with_context(generate_stream()), 
                        content_type='text/event-stream')

    except Exception as e:
        app.logger.error(f"Streaming question error: {str(e)}")
        return Response(f"data: {{'status': 'error', 'message': 'Failed to process question: {str(e)}'}}\n\n", 
                      content_type='text/event-stream')

# Cleanup utility for expired sessions
@app.route('/maintenance/cleanup', methods=['POST'])
def cleanup_expired_sessions():
    """Administrative endpoint to clean up expired sessions"""
    if request.headers.get('X-Admin-Key') != os.getenv('ADMIN_KEY', 'default_admin_key'):
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
        
    try:
        current_time = time.time()
        expiration_hours = int(request.form.get('expiration_hours', 24))
        expiration_seconds = expiration_hours * 3600
        
        expired_count = 0
        session_ids = list(conversation_history.keys())
        
        for session_id in session_ids:
            session = conversation_history.get(session_id)
            if session and (current_time - session['timestamp']) > expiration_seconds:
                del conversation_history[session_id]
                expired_count += 1
                
        return jsonify({
            'status': 'success', 
            'message': f'Cleaned up {expired_count} expired sessions',
            'remaining_sessions': len(conversation_history)
        })
        
    except Exception as e:
        app.logger.error(f"Cleanup error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to clean up sessions: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True)
