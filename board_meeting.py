import os
import sys
import time
from datetime import datetime
from google import genai
from google.genai import types
from dotenv import load_dotenv

# --- CONFIGURATION ---
# Use 2.5-flash for the 1000 RPD limit to avoid the 20 RPD cap of 3.0-preview
MODEL_NAME = "gemini-3.1-flash-lite-preview" 

# Anchor the directory to the script's physical location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_ROOM_DIR = os.path.join(SCRIPT_DIR, ".board_contexts")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "BOARD_MANDATE.md")

CURRENT_DATE = datetime.now().strftime("%Y-%m-%d")
LOCATION = "Auckland, New Zealand"
CURRENCY = "NZD"

def setup_client():
    load_dotenv()
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ FATAL ERROR: GOOGLE_API_KEY not found in .env")
        sys.exit(1)
    
    return genai.Client(api_key=api_key)

def load_data_room():
    data_room_content = ""
    if not os.path.exists(DATA_ROOM_DIR):
        print(f"⚠️ WARNING: Data room directory '{DATA_ROOM_DIR}' not found. Check your folder structure.")
        return "No specific business context provided."

    print(f"📂 Loading Data Room context from: {DATA_ROOM_DIR}")
    for root, _, files in os.walk(DATA_ROOM_DIR):
        for file in sorted(files):
            if file.endswith(('.md', '.txt', '.json', '.csv')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data_room_content += f"\n\n[DOCUMENT: {file}]\n{f.read()}"
                    print(f"  ✓ Loaded: {file}")
                except Exception as e:
                    print(f"  ❌ Failed to read {file}: {e}")
                    
    return data_room_content

def call_agent(client, role_prompt, input_data, max_retries=5):
    full_prompt = f"{role_prompt}\n\nCONTEXT AND INPUT:\n{input_data}"
    
    for attempt in range(max_retries):
        try:
            time.sleep(4) 
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                )
            )
            return response.text
        except Exception as e:
            error_msg = str(e)
            if any(code in error_msg for code in ["429", "Quota", "503", "UNAVAILABLE", "500"]):
                wait_time = 30 * (attempt + 1)
                print(f"      [API Busy/Throttled] Sleeping {wait_time}s to retry...")
                time.sleep(wait_time)
            else:
                print(f"      [Fatal Error] {error_msg}")
                return "" 
                
    print(f"      [Failed] Agent dropped from meeting after {max_retries} attempts.")
    return "" 

def run_strategic_debate(topic):
    client = setup_client()
    data_room_context = load_data_room()
    base_context = f"DATE: {CURRENT_DATE}\nLOCATION: {LOCATION}\nCURRENCY: {CURRENCY}\n\nDATA ROOM:\n{data_room_context}"
    
    print(f"\n🚀 INITIATING EXECUTIVE BOARD DEBATE: '{topic}'")
    print(f"🧠 SDK: google-genai | Model: {MODEL_NAME}\n")
    
    print("📢 Round 1: Gathering Executive Priorities...")
    
    roles = {
        "VP_Finance_and_Risk": "You are the VP of Finance & Risk. Focus on the $50/mo OpEx limit, legal liability, AS/NZS 3000 compliance, and NZD math integrity. DO NOT write code. State your core demands.",
        "Strategist": "You are the Head of Strategy & M&A. Focus on the $10M exit. Define what data is actually valuable to a buyer (e.g., Share of Wallet). DO NOT write code. Define the business value.",
        "Product_Lead": "You are the Head of Product. Your metric is 'Time-to-Value' and user adoption. You represent the Sparky in the basement. Veto user friction. DO NOT write code.",
        "CTO": "You are the Chief Technology Officer. You do not write code. Establish engineering policies (resilience, offline sync). Do not mention specific databases or languages."
    }

    round_1_outputs = {}
    for role, prompt in roles.items():
        print(f"   -> Consulting {role}...")
        statement = call_agent(client, prompt, f"{base_context}\n\nSTRATEGIC INITIATIVE: {topic}\nProvide your independent executive opening statement.")
        round_1_outputs[role] = statement

    compiled_round_1 = "\n\n".join([f"*** {role} OPENING STATEMENT ***\n{text}" for role, text in round_1_outputs.items()])

    print("\n⚔️ Round 2: Executive Cross-Examination...")
    
    round_2_outputs = {}
    for role, prompt in roles.items():
        print(f"   -> {role} is challenging the board...")
        rebuttal_prompt = f"{prompt}\n\nReview the other executives' statements. Challenge any priorities that threaten your core metrics. Force compromises. Do not drop into technical weeds."
        statement = call_agent(client, rebuttal_prompt, f"INITIATIVE: {topic}\n\nROUND 1 STATEMENTS:\n{compiled_round_1}")
        round_2_outputs[role] = statement

    compiled_round_2 = "\n\n".join([f"*** {role} REBUTTAL ***\n{text}" for role, text in round_2_outputs.items()])

    print("\n✍️ Finalizing the Board Mandate...")
    
    chair_prompt = """
    You are the Chairman of the Board. 
    Synthesize the executive debate into a formal 'Strategic Product & Business Mandate' for the Chief Architect.
    
    RULES:
    1. Output a high-level Business Requirements Document (BRD).
    2. Define the 'Definition of Success' for this initiative.
    3. Define the strict business, financial, and UX constraints.
    4. ABSOLUTE PROHIBITION: Do not write code, SQL, specify libraries, or dictate file structures. 
    5. Hand the Architect the 'What' and the 'Why'. Tell them they have full autonomy over the 'How' as long as constraints are met.
    """
    
    debate_transcript = f"ROUND 1:\n{compiled_round_1}\n\nROUND 2:\n{compiled_round_2}"
    final_mandate = call_agent(client, chair_prompt, debate_transcript)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(f"# 🏛️ SPARK OPS EXECUTIVE MANDATE\n")
        f.write(f"> Initiative: {topic}\n")
        f.write(f"> Date: {CURRENT_DATE}\n\n")
        f.write("## 1. Executive Debate Transcript\n\n")
        f.write(debate_transcript + "\n\n")
        f.write("## 2. Strategic Mandate for the Chief Architect\n\n")
        f.write(final_mandate)
        
    print(f"\n✅ DEBATE COMPLETE. Output saved to {OUTPUT_FILE}")
    print("👉 ACTION: Hand this Mandate to your Chief Architect (Windsurf) to design the technical implementation.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python board_meeting.py 'Initiative to discuss'")
    else:
        run_strategic_debate(sys.argv[1])