import os
import fitz  # PyMuPDF
import docx
from pptx import Presentation

def extract_text_from_pdf(file_path: str) -> str:
    """Extracts raw text from a PDF file page by page"""
    text = ""
    with fitz.open(file_path) as doc:
        for page in doc:
            text += page.get_text()
    return text

def extract_text_from_docx(file_path: str) -> str:
    """Extracts raw text from a Word document paragraph by paragraph"""
    doc = docx.Document(file_path)
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    return '\n'.join(full_text)

def extract_text_from_pptx(file_path: str) -> str:
    """Extracts raw text from PowerPoint presentation slides and shapes"""
    prs = Presentation(file_path)
    text_runs = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                text_runs.append(shape.text)
    return '\n'.join(text_runs)

def extract_text(file_path: str, file_type: str) -> str:
    """
    Unified text extraction method based on file format extension.
    Validates file existence, empty files, and extracts content.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if os.path.getsize(file_path) == 0:
        raise ValueError("The uploaded file is empty.")

    file_type = file_type.lower()
    
    if file_type == "pdf":
        text = extract_text_from_pdf(file_path)
    elif file_type == "docx":
        text = extract_text_from_docx(file_path)
    elif file_type == "pptx":
        text = extract_text_from_pptx(file_path)
    else:
        raise ValueError(f"Unsupported file type for extraction: {file_type}")

    if not text.strip():
        raise ValueError("No readable text content could be extracted from the file.")
        
    return text
