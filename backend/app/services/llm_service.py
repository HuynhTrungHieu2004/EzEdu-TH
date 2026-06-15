from google import genai
from google.genai import types
from app.core.config import settings

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

def get_embedding(text: str) -> list[float]:
    """Generates a vector embedding for a single text input using text-embedding-004"""
    client = get_genai_client()
    response = client.models.embed_content(
        model="text-embedding-004",
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
            model="text-embedding-004",
            contents=batch
        )
        embeddings.extend([emb.values for emb in response.embeddings])
    return embeddings

