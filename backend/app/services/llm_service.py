from google import genai
from google.genai import types
from app.core.config import settings

import logging
logger = logging.getLogger(__name__)

def get_genai_client():
    """Initializes and returns the Google GenAI client if api_key is configured"""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured in the application environment (.env file).")
    return genai.Client(api_key=settings.GEMINI_API_KEY)

def generate_content(prompt: str) -> str:
    """Generates standard text content using Gemini API"""
    client = get_genai_client()
    model = settings.GEMINI_MODEL or "gemini-2.5-flash"
    response = client.models.generate_content(
        model=model,
        contents=prompt
    )
    return response.text

def generate_json(prompt: str) -> str:
    """Generates a JSON formatted string using Gemini API with response_mime_type='application/json'"""
    client = get_genai_client()
    model = settings.GEMINI_MODEL or "gemini-2.5-flash"
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json"
        )
    )
    return response.text

def generate_json_with_file(prompt: str, file_path: str) -> str:
    """Uploads a file to Gemini File API and generates a JSON formatted response based on it."""
    client = get_genai_client()
    model = settings.GEMINI_MODEL or "gemini-2.5-flash"
    
    # 1. Upload the file to Gemini File API
    logger.info(f"Uploading file {file_path} to Gemini File API...")
    uploaded_file = client.files.upload(file=file_path)
    
    # 2. Wait if processing
    import time
    state_str = getattr(uploaded_file.state, "name", str(uploaded_file.state))
    while state_str == "PROCESSING":
        logger.info("Waiting for file processing in Gemini...")
        time.sleep(2)
        uploaded_file = client.files.get(name=uploaded_file.name)
        state_str = getattr(uploaded_file.state, "name", str(uploaded_file.state))
        
    if state_str == "FAILED":
        raise ValueError("Gemini failed to process the uploaded video file.")
        
    try:
        # 3. Generate content
        logger.info(f"Generating questions from file with prompt...")
        response = client.models.generate_content(
            model=model,
            contents=[uploaded_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return response.text
    finally:
        # Clean up the file from Gemini File API
        try:
            logger.info(f"Cleaning up file {uploaded_file.name} from Gemini File API...")
            client.files.delete(name=uploaded_file.name)
        except Exception as cleanup_err:
            logger.warning(f"Failed to delete file from Gemini: {cleanup_err}")

def get_embedding(text: str) -> list[float]:
    """Generates a vector embedding for a single text input using text-embedding-004"""
    client = get_genai_client()
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text
    )
    return response.embeddings[0].values

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generates vector embeddings in batches of 100 for list of text inputs"""
    client = get_genai_client()
    embeddings = []
    # Batch size limit for Gemini API embed_content is 100 elements
    for i in range(0, len(texts), 100):
        batch = texts[i:i+100]
        response = client.models.embed_content(
            model="gemini-embedding-001",
            contents=batch
        )
        embeddings.extend([emb.values for emb in response.embeddings])
    return embeddings


def transcribe_video(file_path: str) -> str:
    """Uploads a video to Gemini File API and requests transcription in Vietnamese."""
    client = get_genai_client()
    model = settings.GEMINI_MODEL or "gemini-2.5-flash"
    
    logger.info(f"Uploading video {file_path} to Gemini File API for transcription...")
    uploaded_file = client.files.upload(file=file_path)
    
    import time
    state_str = getattr(uploaded_file.state, "name", str(uploaded_file.state))
    while state_str == "PROCESSING":
        logger.info("Waiting for video processing in Gemini...")
        time.sleep(2)
        uploaded_file = client.files.get(name=uploaded_file.name)
        state_str = getattr(uploaded_file.state, "name", str(uploaded_file.state))
        
    if state_str == "FAILED":
        raise ValueError("Gemini failed to process the uploaded video file.")
        
    try:
        prompt = (
            "Please provide a complete transcript of the audio in this video. "
            "Write the transcript in Vietnamese (or keep the original language if it's not Vietnamese). "
            "Only return the transcript text, do not add introductory comments or markdown format."
        )
        logger.info("Generating transcript using Gemini...")
        response = client.models.generate_content(
            model=model,
            contents=[uploaded_file, prompt]
        )
        transcript = (response.text or "").strip()
        if not transcript:
            raise ValueError("Gemini returned an empty transcript for this video.")
        return transcript
    finally:
        try:
            logger.info(f"Cleaning up file {uploaded_file.name} from Gemini File API...")
            client.files.delete(name=uploaded_file.name)
        except Exception as cleanup_err:
            logger.warning(f"Failed to delete file from Gemini: {cleanup_err}")

