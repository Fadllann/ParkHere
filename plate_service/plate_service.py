from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
from huggingface_hub import hf_hub_download
import easyocr
import cv2
import numpy as np
import base64
import re
import os
import sys
import time

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

class BypassHostCheck:
    def __init__(self, app):
        self.app = app
    def __call__(self, environ, start_response):
        environ.pop('HTTP_HOST', None)
        return self.app(environ, start_response)

app.wsgi_app = BypassHostCheck(app.wsgi_app)
CORS(app)

# Indonesian plate: B 1234 ABC / AB 123 CD
PLATE_RE = re.compile(r'^[A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{2,3}$')
ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '

DEBUG_DIR = "/tmp/debug"
os.makedirs(DEBUG_DIR, exist_ok=True)

def load_yolo():
    print("[Init] Loading YOLO model from HuggingFace...")
    sys.stdout.flush()
    try:
        model_path = hf_hub_download(
            repo_id="Koushim/yolov8-license-plate-detection",
            filename="best.pt"
        )
        model = YOLO(model_path)
        print(f"[Init] YOLO loaded: {model_path}")
        sys.stdout.flush()
        return model
    except Exception as e:
        print(f"[Init] YOLO load failed: {e}")
        sys.stdout.flush()
        raise

yolo = load_yolo()
if yolo is None:
    raise RuntimeError("YOLO failed to load")

print("[Init] Loading EasyOCR...")
sys.stdout.flush()
ocr_reader = easyocr.Reader(['en'], gpu=False)

print("[Init] Warming up EasyOCR...")
sys.stdout.flush()
try:
    dummy = np.ones((720, 1280, 3), dtype=np.uint8) * 128
    cv2.putText(dummy, "B 1234 CD", (400, 400), cv2.FONT_HERSHEY_SIMPLEX, 3, (255, 255, 255), 4)
    gray_dummy = cv2.cvtColor(dummy, cv2.COLOR_BGR2GRAY)
    ocr_reader.readtext(gray_dummy, allowlist=ALLOWLIST, batch_size=1)
    print("[Init] EasyOCR warmed up.")
except Exception as e:
    print(f"[Init] Warmup warning: {e}")
sys.stdout.flush()

print("[Init] Ready.")
sys.stdout.flush()

def decode_image(b64_string):
    b64 = re.sub(r'^data:image/\w+;base64,', '', b64_string)
    img_bytes = base64.b64decode(b64)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)


def preprocess_crop(crop):
    h, w = crop.shape[:2]
    target_h = max(80, h * 2)
    scale = target_h / h
    crop = cv2.resize(crop, (int(w * scale), target_h), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
    gray = clahe.apply(gray)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    gray = cv2.filter2D(gray, -1, kernel)
    return gray, cv2.bitwise_not(gray)


def clean_plate_text(raw):
    text = raw.upper().strip()
    text = re.sub(r'[^A-Z0-9 ]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()

    d2l = {'0': 'O', '1': 'I', '8': 'B'}
    l2d = {'O': '0', 'I': '1', 'B': '8'}

    if not PLATE_RE.match(text):
        parts = text.split(' ')
        if len(parts) >= 2:
            parts[0] = re.sub(r'[0-9]', lambda m: d2l.get(m.group(), m.group()), parts[0])
            parts[1] = re.sub(r'[A-Z]', lambda m: l2d.get(m.group(), m.group()), parts[1])
            if len(parts) >= 3:
                parts[2] = re.sub(r'[0-9]', lambda m: d2l.get(m.group(), m.group()), parts[2])
            text = ' '.join(parts)
    return text


def is_plate_shaped(w, h):
    """Plates are wide. Reject square/tall detections and tiny noise."""
    if w == 0 or h == 0:
        return False, "zero"
    aspect = w / h
    if aspect < 1.5:
        return False, f"aspect {aspect:.2f} too low"
    if w < 60 or h < 12:
        return False, f"too small {w}x{h}"
    return True, "ok"


def run_ocr(crop_bgr, label=''):
    normal, inverted = preprocess_crop(crop_bgr)
    candidates = []

    for vname, variant in [('normal', normal), ('inverted', inverted)]:
        try:
            results = ocr_reader.readtext(
                variant,
                allowlist=ALLOWLIST,
                batch_size=1,
                paragraph=False,
                detail=1,
                decoder='beamsearch',
                beamWidth=10,
            )
            for (_, text, conf) in results:
                cleaned = clean_plate_text(text)
                if len(cleaned) >= 4:
                    valid = bool(PLATE_RE.match(cleaned))
                    print(f"[OCR:{label}:{vname}] '{text}'→'{cleaned}' valid={valid} conf={conf:.3f}")
                    sys.stdout.flush()
                    candidates.append({'text': cleaned, 'conf': round(conf, 3), 'valid': valid})
        except Exception as e:
            print(f"[OCR:{label}:{vname}] error: {e}")
            sys.stdout.flush()

        valid_high = [c for c in candidates if c['valid'] and c['conf'] > 0.70]
        if valid_high:
            break

    candidates.sort(key=lambda x: (not x['valid'], -x['conf']))
    return candidates

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/detect', methods=['POST'])
def detect():
    try:
        raw = request.get_data(cache=True)
        print(f"[Detect] len={len(raw)} content_type={request.content_type}")
        sys.stdout.flush()

        if not raw:
            return jsonify({'success': False, 'error': 'Empty body'}), 400

        data = request.get_json(force=True, silent=True)
        if data is None:
            print(f"[Detect] Parse fail, preview: {raw[:200]}")
            return jsonify({'success': False, 'error': 'JSON parse failed'}), 400

        if 'image' not in data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        img = decode_image(data['image'])
        if img is None:
            return jsonify({'success': False, 'error': 'Invalid image'}), 400

        h, w = img.shape[:2]
        all_candidates = []
        ts = int(time.time())
        cv2.imwrite(f"{DEBUG_DIR}/full_{ts}.jpg", img)
        print(f"[Debug] full_{ts}.jpg ({w}x{h})")
        sys.stdout.flush()

        try:
            yolo_results = yolo.predict(img, conf=0.15, verbose=False)[0]
            boxes = sorted(yolo_results.boxes, key=lambda b: float(b.conf), reverse=True)
            print(f"[YOLO] {len(boxes)} detection(s)")
            sys.stdout.flush()

            for box in boxes[:3]:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                yolo_conf = float(box.conf)
                bw, bh = x2 - x1, y2 - y1

                ok, reason = is_plate_shaped(bw, bh)
                if not ok:
                    print(f"[YOLO] Skip: {reason}")
                    sys.stdout.flush()
                    continue

                pad_x = max(30, int(bw * 0.15))
                pad_y = max(15, int(bh * 0.30))
                x1p = max(0, x1 - pad_x)
                y1p = max(0, y1 - pad_y)
                x2p = min(w, x2 + pad_x)
                y2p = min(h, y2 + pad_y)

                crop = img[y1p:y2p, x1p:x2p]
                if crop.size == 0:
                    continue

                cv2.imwrite(f"{DEBUG_DIR}/crop_{ts}_{x1p}_{y1p}.jpg", crop)
                print(f"[YOLO] raw=({x1},{y1},{x2},{y2}) padded=({x1p},{y1p},{x2p},{y2p}) conf={yolo_conf:.2f}")
                sys.stdout.flush()

                for c in run_ocr(crop, label='yolo'):
                    c.update({'yolo_conf': round(yolo_conf, 3), 'source': 'yolo_crop'})
                    all_candidates.append(c)

                valid = [c for c in all_candidates if c['valid']]
                if valid and max(c['conf'] for c in valid) > 0.80:
                    print("[YOLO] High-conf result, stopping")
                    sys.stdout.flush()
                    break

        except Exception as ye:
            print(f"[YOLO] error: {ye}")
            sys.stdout.flush()

        if not any(c['valid'] for c in all_candidates):
            print("[Strip] Scanning image strips")
            sys.stdout.flush()

            strips = [
                (0.0,  0.45, 'top'),
                (0.25, 0.70, 'mid-upper'),
                (0.45, 0.85, 'mid-lower'),
                (0.6,  1.0,  'bottom'),
            ]

            for top, bot, label in strips:
                strip = img[int(h * top):int(h * bot), int(w * 0.03):int(w * 0.97)]
                if strip.size == 0:
                    continue
                cv2.imwrite(f"{DEBUG_DIR}/strip_{ts}_{label}.jpg", strip)
                print(f"[Strip] {label} ({top:.0%}-{bot:.0%})")
                sys.stdout.flush()

                for c in run_ocr(strip, label=label):
                    c['source'] = f'strip_{label}'
                    all_candidates.append(c)

                if any(c['valid'] for c in all_candidates):
                    print(f"[Strip] Valid found in {label}, stopping")
                    sys.stdout.flush()
                    break

        all_candidates.sort(key=lambda x: (not x['valid'], -x['conf']))

        if not all_candidates:
            print("[Result] No candidates")
            return jsonify({'success': True, 'plate': 'UNKNOWN', 'candidates': []})

        best = all_candidates[0]
        print(f"[Result] '{best['text']}' valid={best['valid']} conf={best['conf']}")
        sys.stdout.flush()

        return jsonify({
            'success': True,
            'plate': best['text'],
            'valid': best['valid'],
            'confidence': best['conf'],
            'candidates': all_candidates[:5],
        })

    except Exception as e:
        import traceback
        print(f"[Error] {e}")
        traceback.print_exc()
        sys.stdout.flush()
        return jsonify({'success': False, 'error': str(e), 'plate': 'UNKNOWN'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)), debug=False)