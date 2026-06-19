import pyautogui
from flask import Flask, request, jsonify
from flask_cors import CORS
import time
import base64
import io
import cv2
import easyocr
import numpy as np
from PIL import Image

app = Flask(__name__)
CORS(app) # Enable CORS for all routes so Chrome Extension can call it

print("Initializing OCR Reader... (this may take a moment)")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)
print("OCR Reader ready.")

# Disable PyAutoGUI failsafe so it doesn't crash if mouse is in the corner
pyautogui.FAILSAFE = False

@app.route('/click', methods=['POST'])
def click_element():
    try:
        data = request.json
        x = data.get('x')
        y = data.get('y')
        
        if x is None or y is None:
            return jsonify({'error': 'x and y coordinates are required'}), 400
        
        # Convert to int
        x = int(x)
        y = int(y)
        
        print(f"Executing hardware click at coordinates: X={x}, Y={y}")
        
        # Move the mouse naturally over 0.3 seconds to the target
        pyautogui.moveTo(x, y, duration=0.3, tween=pyautogui.easeInOutQuad)
        
        # Wait a tiny bit for UI hover effects to trigger
        time.sleep(0.4)
        
        # Execute the hardware click
        pyautogui.click(x, y)
        
        return jsonify({'status': 'success', 'message': f'Clicked at {x}, {y}'}), 200
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/solve_captcha', methods=['POST'])
def solve_captcha_route():
    try:
        data = request.json
        b64_string = data.get('base64', '')
        
        if not b64_string:
            return jsonify({'error': 'No base64 string provided'}), 400
            
        if "," in b64_string:
            b64_string = b64_string.split(",")[1]
            
        img_data = base64.b64decode(b64_string)
        img = Image.open(io.BytesIO(img_data)).convert("RGBA")
        
        # Process image (Black background, white text)
        background = Image.new("RGBA", img.size, (0, 0, 0, 255))
        background.paste(img, (0, 0), img)

        pixels = background.load()
        for y in range(background.height):
            for x in range(background.width):
                r, g, b, a = pixels[x, y]
                if (r, g, b) != (0, 0, 0):
                    pixels[x, y] = (255, 255, 255, 255)
                else:
                    pixels[x, y] = (0, 0, 0, 255)

        # Convert PIL image to OpenCV Grayscale array for EasyOCR
        cv_img = cv2.cvtColor(np.array(background), cv2.COLOR_RGBA2GRAY)
        _, thresh_img = cv2.threshold(cv_img, 128, 255, cv2.THRESH_BINARY)

        # Extract Text using EasyOCR
        results = reader.readtext(thresh_img, detail=0, paragraph=False)
        extracted_text = "".join(results)
        
        print(f"CAPTCHA Solved: {extracted_text}")
        return jsonify({'status': 'success', 'text': extracted_text}), 200

    except Exception as e:
        print(f"Error solving CAPTCHA: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("==================================================")
    print("IRCTC OS-Level Mouse Controller Started!")
    print("Listening for click commands on http://localhost:5000")
    print("Keep this terminal open while booking tickets.")
    print("==================================================")
    
    # Run the server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=False)
