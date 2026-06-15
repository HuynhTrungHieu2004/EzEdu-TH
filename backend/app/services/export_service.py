import io
import os
from datetime import datetime
import docx

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

def register_vietnamese_font():
    """Attempts to dynamically register Vietnamese unicode Arial font on macOS to prevent tofu blocks in PDFs"""
    mac_paths = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    ]
    
    registered = False
    for path in mac_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("Arial", path))
                registered = True
                break
            except Exception:
                pass
                
    # Fallback to Helvetica if registration fails, Helvetica names are registered by default in ReportLab
    return registered

def export_question_set_to_docx(question_set: dict) -> io.BytesIO:
    """Exports a question set list into formatted DOCX format in-memory"""
    doc = docx.Document()
    
    # Document title
    doc.add_heading("BỘ CÂU HỎI ĐÁNH GIÁ NĂNG LỰC", level=1)
    
    # Document metadata info
    doc.add_paragraph(f"Tài liệu học liệu: {question_set.get('document_name', 'Tài liệu không tên')}")
    
    created_at = question_set.get('created_at')
    if isinstance(created_at, datetime):
        created_str = created_at.strftime("%Y-%m-%d %H:%M:%S")
    else:
        created_str = str(created_at)
        
    doc.add_paragraph(f"Thời gian khởi tạo: {created_str}")
    doc.add_paragraph(f"Cấp độ khó: {question_set.get('difficulty', 'Trung bình')} | Dạng câu hỏi: {question_set.get('question_type', 'Trắc nghiệm')}")
    doc.add_paragraph("-" * 60)
    
    # Process question list
    questions = question_set.get("questions", [])
    for idx, q in enumerate(questions, 1):
        doc.add_paragraph(f"Câu {idx}: {q.get('question')}", style='List Bullet')
        
        # Options
        options = q.get("options")
        if options and isinstance(options, dict):
            for opt_key, opt_val in options.items():
                doc.add_paragraph(f"   {opt_key}. {opt_val}")
                
        doc.add_paragraph(f"   Đáp án chính xác: {q.get('correct_answer')}")
        doc.add_paragraph(f"   Giải thích chi tiết: {q.get('explanation')}")
        doc.add_paragraph("")
        
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    return file_stream

def export_question_set_to_pdf(question_set: dict) -> io.BytesIO:
    """Exports a question set list into formatted PDF format in-memory using ReportLab"""
    register_vietnamese_font()
    # Choose font
    font_name = "Arial" if "Arial" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    
    file_stream = io.BytesIO()
    doc = SimpleDocTemplate(
        file_stream, 
        pagesize=letter, 
        rightMargin=40, 
        leftMargin=40, 
        topMargin=40, 
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Customized styles using unicode-supporting font
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName=font_name,
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        spaceAfter=15
    )
    
    meta_style = ParagraphStyle(
        'MetaStyle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        leading=14,
        spaceAfter=6
    )
    
    question_style = ParagraphStyle(
        'QuestionStyle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=11,
        leading=15,
        spaceBefore=10,
        spaceAfter=6
    )
    
    option_style = ParagraphStyle(
        'OptionStyle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        leading=14,
        leftIndent=15,
        spaceAfter=3
    )
    
    ans_style = ParagraphStyle(
        'AnsStyle',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        leading=14,
        leftIndent=15,
        spaceAfter=3
    )
    
    story = []
    
    story.append(Paragraph("<b>BỘ CÂU HỎI ĐÁNH GIÁ NĂNG LỰC</b>", title_style))
    story.append(Spacer(1, 10))
    
    # Metadata info
    story.append(Paragraph(f"<b>Học liệu điện tử:</b> {question_set.get('document_name', 'Tài liệu không tên')}", meta_style))
    created_at = question_set.get('created_at')
    if isinstance(created_at, datetime):
        created_str = created_at.strftime("%Y-%m-%d %H:%M:%S")
    else:
        created_str = str(created_at)
        
    story.append(Paragraph(f"<b>Thời gian sinh đề:</b> {created_str}", meta_style))
    story.append(Paragraph(f"<b>Độ khó thiết lập:</b> {question_set.get('difficulty', 'Trung bình')} | <b>Dạng câu hỏi:</b> {question_set.get('question_type', 'Trắc nghiệm')}", meta_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("----------------------------------------------------------------------------------------------------", meta_style))
    
    # Process question list
    questions = question_set.get("questions", [])
    for idx, q in enumerate(questions, 1):
        story.append(Paragraph(f"<b>Câu {idx}:</b> {q.get('question')}", question_style))
        
        # Options
        options = q.get("options")
        if options and isinstance(options, dict):
            for opt_key, opt_val in options.items():
                story.append(Paragraph(f"{opt_key}. {opt_val}", option_style))
                
        story.append(Paragraph(f"<b>Đáp án chính xác:</b> {q.get('correct_answer')}", ans_style))
        story.append(Paragraph(f"<b>Giải thích chi tiết:</b> {q.get('explanation')}", option_style))
        story.append(Spacer(1, 10))
        
    doc.build(story)
    file_stream.seek(0)
    return file_stream
