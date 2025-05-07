from flask import Flask, render_template, request, jsonify
import os
import google.generativeai as genai
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
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

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

# ----- Waste Calculator Functions -----

def validate_waste_calculator_data(data):
    """Validate required fields for waste calculator"""
    required_fields = [
        'pouchHeight',
        'pouchWidth',
        'hasGusset',
        'isFivePanel',
        'laminateStructure',
        'gsm',
        'quantityType'
    ]
    
    for field in required_fields:
        if field not in data:
            return False, f"Missing required field: {field}"
            
    # Validate conditional required fields
    if data.get('hasGusset') == True and 'gussetSize' not in data:
        return False, "Missing required field: gussetSize for gusseted pouch"
        
    if data.get('isFivePanel') == True and 'sidePanelWidth' not in data:
        return False, "Missing required field: sidePanelWidth for 5-panel pouch"
        
    if data.get('quantityType') == 'pouches' and 'pouchesQuantity' not in data:
        return False, "Missing required field: pouchesQuantity"
        
    if data.get('quantityType') == 'laminate' and 'laminateWeight' not in data:
        return False, "Missing required field: laminateWeight"
        
    return True, ""

def calculate_waste(data):
    """Calculate pouch manufacturing waste based on specifications"""
    
    # Calculate pouch area in mm²
    if data.get('isFivePanel'):
        pouchAreaMm2 = data['pouchHeight'] * (data['pouchWidth'] + 2 * data['sidePanelWidth'])
    elif data.get('hasGusset'):
        pouchAreaMm2 = data['pouchHeight'] * (data['pouchWidth'] + data['gussetSize'])
    else:
        pouchAreaMm2 = data['pouchHeight'] * data['pouchWidth']
    
    # Convert to m²
    pouchAreaM2 = pouchAreaMm2 / 1000000
    
    # Calculate total area
    if data.get('quantityType') == 'pouches':
        totalAreaM2 = pouchAreaM2 * data['pouchesQuantity']
    else:
        totalAreaM2 = (data['laminateWeight'] * 1000) / data['gsm']
    
    # Determine waste percentages based on quantity
    quantity = data['pouchesQuantity'] if data.get('quantityType') == 'pouches' else round(totalAreaM2 / pouchAreaM2)
    
    
    
    if quantity <= 10000:
        printingWastePercent = 2.0  # 100%
        pouchingWastePercent = 2.0  # 100%
    elif quantity <= 50000:
        printingWastePercent = 0.30  # 3%
        pouchingWastePercent = 0.20  # 2%
    else:
        printingWastePercent = 0.10  # 2%
        pouchingWastePercent = 0.10  # 1.5%
    
    # Calculate waste by process
    printingWasteM2 = totalAreaM2 * printingWastePercent
    laminationWasteM2 = totalAreaM2 * 0.20  # 2%
    slittingWasteM2 = totalAreaM2 * 0.15  # 0.75%
    pouchingWasteM2 = totalAreaM2 * pouchingWastePercent
    
    # Total waste
    totalWasteM2 = printingWasteM2 + laminationWasteM2 + slittingWasteM2 + pouchingWasteM2
    
    # Convert to KG
    printingWasteKg = (printingWasteM2 * data['gsm']) / 1000
    laminationWasteKg = (laminationWasteM2 * data['gsm']) / 1000
    slittingWasteKg = (slittingWasteM2 * data['gsm']) / 1000
    pouchingWasteKg = (pouchingWasteM2 * data['gsm']) / 1000
    totalWasteKg = (totalWasteM2 * data['gsm']) / 1000
    totalLaminateKg = (totalAreaM2 * data['gsm']) / 1000
    
    # Calculate number of pouches (if laminate weight was input)
    if data.get('quantityType') == 'laminate':
        calculatedPouches = round(totalAreaM2 / pouchAreaM2)
    else:
        calculatedPouches = data['pouchesQuantity']
    
    return {
        "pouchAreaMm2": round(pouchAreaMm2, 2),
        "pouchAreaM2": round(pouchAreaM2, 4),
        "totalAreaM2": round(totalAreaM2, 2),
        "totalLaminateKg": round(totalLaminateKg, 2),
        "calculatedPouches": calculatedPouches,
        "waste": {
            "printing": {
                "areaM2": round(printingWasteM2, 2),
                "weightKg": round(printingWasteKg, 2),
                "percentage": round(printingWastePercent * 100, 2)
            },
            "lamination": {
                "areaM2": round(laminationWasteM2, 2),
                "weightKg": round(laminationWasteKg, 2),
                "percentage": 2.0
            },
            "slitting": {
                "areaM2": round(slittingWasteM2, 2),
                "weightKg": round(slittingWasteKg, 2),
                "percentage": 0.75
            },
            "pouching": {
                "areaM2": round(pouchingWasteM2, 2),
                "weightKg": round(pouchingWasteKg, 2),
                "percentage": round(pouchingWastePercent * 100, 2)
            },
            "total": {
                "areaM2": round(totalWasteM2, 2),
                "weightKg": round(totalWasteKg, 2),
                "percentage": round((totalWasteM2 / totalAreaM2) * 100, 2)
            }
        }
    }

# ----- Routes -----

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/waste-calculator')
def waste_calculator():
    return render_template('waste_calculator.html')

@app.route('/calculate-waste', methods=['POST'])
def calculate_waste_route():
    try:
        data = request.json
        
        # Convert string booleans to actual booleans
        if 'hasGusset' in data:
            data['hasGusset'] = data['hasGusset'] == 'yes' if isinstance(data['hasGusset'], str) else data['hasGusset']
        
        if 'isFivePanel' in data:
            data['isFivePanel'] = data['isFivePanel'] == 'yes' if isinstance(data['isFivePanel'], str) else data['isFivePanel']
        
        # Validate data
        is_valid, message = validate_waste_calculator_data(data)
        if not is_valid:
            return jsonify({'status': 'error', 'message': message}), 400
        
        # Perform calculations
        results = calculate_waste(data)
        
        return jsonify({
            'status': 'success',
            'results': results
        })
        
    except Exception as e:
        app.logger.error(f"Waste calculation error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to calculate waste: {str(e)}"
        }), 500

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

        # Generate recommendation
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

    except Exception as e:
        app.logger.error(f"Recommendation error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to generate recommendation: {str(e)}"
        }), 500

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

        # Generate answer
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

    except Exception as e:
        app.logger.error(f"Question error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to process question: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
