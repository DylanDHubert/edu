#!/usr/bin/env python3
"""
OpenAI Assistant Testing Script - TS Knee Portfolio with User Notes PDF
Following EXACTLY how it's done in the HHB app, but with detailed logging
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import time
import json
from datetime import datetime

# Load environment variables
load_dotenv()

# Initialize OpenAI client EXACTLY like in HHB app (no special headers needed)
client = OpenAI(
    api_key=os.getenv('OPENAI_API_KEY')
)

# Global logging list
log_entries = []

def safe_serialize(obj):
    """Safely serialize objects to JSON-compatible format"""
    if obj is None:
        return None
    try:
        # Try to convert to dict if it has __dict__
        if hasattr(obj, '__dict__'):
            return str(obj)
        # If it's already serializable, return as-is
        json.dumps(obj)
        return obj
    except (TypeError, AttributeError):
        return str(obj)

def log_entry(category, message, data=None):
    """Add entry to log with timestamp"""
    entry = {
        'timestamp': datetime.now().isoformat(),
        'category': category,
        'message': message,
        'data': safe_serialize(data) if data else None
    }
    log_entries.append(entry)
    print(f"[{category.upper()}] {message}")

def create_assistant_and_vector_store():
    """Create assistant and vector store with BOTH TS Knee PDF and User Notes PDF"""
    log_entry("setup", "🚀 STARTING ASSISTANT SETUP...")
    
    # PORTFOLIO CONFIG with BOTH PDFs
    portfolio = {
        'name': 'TS KNEE WITH USER NOTES PORTFOLIO',
        'description': 'TS KNEE SURGICAL TECHNIQUES WITH USER NOTES',
        'files': [
            'TS_Knee_triathlon-TS-Brochure.pdf',  # Original TS Knee PDF
            'user_notes_test.pdf'  # User notes PDF
        ],
        'file_paths': [
            'data/ts_knee/TS_Knee_triathlon-TS-Brochure.pdf',
            'user_notes/user_notes_test.pdf'
        ]
    }
    
    log_entry("setup", f"📁 SETTING UP {portfolio['name']}...")
    
    try:
        # CREATE VECTOR STORE (exactly like setup-assistants.js line 57)
        log_entry("vector_store", "📦 CREATING VECTOR STORE...")
        vector_store = client.vector_stores.create(
            name=f"{portfolio['name']} Vector Store"
        )
        log_entry("vector_store", f"✅ VECTOR STORE CREATED", {'vector_store_id': vector_store.id})
        
        # UPLOAD FILES (exactly like setup-assistants.js lines 62-81)
        log_entry("file_upload", "📄 UPLOADING FILES...")
        file_ids = []
        uploaded_files = []
        
        for i, filename in enumerate(portfolio['files']):
            file_path = Path(portfolio['file_paths'][i])
            
            if not file_path.exists():
                log_entry("file_upload", f"⚠️  FILE NOT FOUND: {filename}", {'path': str(file_path)})
                continue
            
            # Upload file (exactly like setup-assistants.js line 74-77)
            with open(file_path, 'rb') as f:
                file = client.files.create(
                    file=f,
                    purpose='assistants'
                )
            
            file_ids.append(file.id)
            uploaded_files.append({
                'filename': filename,
                'file_id': file.id,
                'size_bytes': file_path.stat().st_size,
                'path': str(file_path)
            })
            log_entry("file_upload", f"✅ UPLOADED: {filename}", {'file_id': file.id, 'size_mb': round(file_path.stat().st_size / (1024*1024), 2)})
        
        # ADD FILES TO VECTOR STORE (exactly like setup-assistants.js lines 84-91)
        if len(file_ids) > 0:
            log_entry("vector_store", "🔗 ADDING FILES TO VECTOR STORE...")
            file_batch = client.vector_stores.file_batches.create_and_poll(
                vector_store.id,
                file_ids=file_ids
            )
            log_entry("vector_store", f"✅ FILES ADDED TO VECTOR STORE", {
                'total_files': file_batch.file_counts.total,
                'completed': file_batch.file_counts.completed,
                'failed': file_batch.file_counts.failed,
                'batch_status': file_batch.status
            })
        
        # CREATE ASSISTANT (exactly like setup-assistants.js lines 94-107)
        log_entry("assistant", "🤖 CREATING ASSISTANT...")
        assistant = client.beta.assistants.create(
            name=f"{portfolio['name']} Assistant",
                         instructions=f"""YOU ARE AN EXPERT MEDICAL ASSISTANT SPECIALIZING IN {portfolio['name']}. USE YOUR KNOWLEDGE BASE TO ANSWER QUESTIONS ABOUT SURGICAL TECHNIQUES, PROTOCOLS, AND MEDICAL PROCEDURES. ALWAYS PROVIDE ACCURATE, DETAILED INFORMATION BASED ON THE UPLOADED DOCUMENTS.

You have access to:
1. TS Knee system documentation 
2. User notes with specific surgical preferences and setups

RESPONSE GUIDELINES:
- Provide comprehensive, detailed answers about surgical techniques and procedures
- Answer questions thoroughly using information from both the technical documentation and user notes
- ONLY when referencing user-uploaded images from the notes: include the URL directly in your response
- Format for user images: "Dr. Costanzo uses specific retractors for total knee procedures: www.example.com/image.jpg"
- Do NOT add quotes, explanatory text, or markdown formatting around the URL
- Do NOT say "you can view" or "available here" - just include the URL directly after the description
- For all other responses, provide normal detailed medical information

When answering questions, search through BOTH the technical documentation AND the user notes to provide comprehensive answers.""",
            model='gpt-4o',
            tools=[{'type': 'file_search'}],
            tool_resources={
                'file_search': {
                    'vector_store_ids': [vector_store.id]
                }
            }
        )
        
        log_entry("assistant", f"✅ ASSISTANT CREATED", {
            'assistant_id': assistant.id,
            'model': assistant.model,
            'tools': [tool.type for tool in assistant.tools],
            'vector_store_ids': assistant.tool_resources.file_search.vector_store_ids
        })
        log_entry("setup", f"✅ {portfolio['name']} SETUP COMPLETE")
        
        return assistant, vector_store, uploaded_files
        
    except Exception as error:
        log_entry("error", f"❌ ERROR SETTING UP {portfolio['name']}: {error}")
        return None, None, None

def create_thread():
    """Create thread exactly like app/utils/openai.ts line 47"""
    thread = client.beta.threads.create()
    log_entry("thread", f"✅ Thread created", {'thread_id': thread.id})
    return thread

def send_message_with_detailed_logging(thread_id, message, assistant_id, question_number):
    """Send message with comprehensive logging of all assistant activities"""
    TIMEOUT_MS = 60000  # 60 SECOND TIMEOUT
    POLL_INTERVAL_MS = 1000  # 1 SECOND POLLING
    
    log_entry("message", f"📤 SENDING QUESTION {question_number}", {'message': message, 'thread_id': thread_id})
    
    try:
        # ADD MESSAGE TO THREAD
        message_obj = client.beta.threads.messages.create(
            thread_id=thread_id,
            role='user',
            content=message
        )
        log_entry("message", "✅ User message added to thread", {'message_id': message_obj.id})
        
        # RUN ASSISTANT
        run = client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=assistant_id
        )
        log_entry("run", "🚀 Assistant run started", {
            'run_id': run.id,
            'status': run.status,
            'assistant_id': assistant_id
        })
        
        # POLL FOR COMPLETION WITH DETAILED LOGGING
        run_status = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)
        attempts = 0
        max_attempts = TIMEOUT_MS // POLL_INTERVAL_MS
        
        while run_status.status in ['in_progress', 'queued']:
            time.sleep(POLL_INTERVAL_MS / 1000)
            run_status = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)
            attempts += 1
            
            log_entry("run_status", f"⏳ Run Status: {run_status.status}", {
                'attempt': attempts,
                'max_attempts': max_attempts,
                'run_id': run.id
            })
            
            # CHECK FOR TIMEOUT
            if attempts >= max_attempts:
                log_entry("error", "❌ ASSISTANT RESPONSE TIMEOUT")
                raise Exception('ASSISTANT RESPONSE TIMEOUT - PLEASE TRY AGAIN')
            
            # CHECK FOR FAILED STATUS
            if run_status.status == 'failed':
                error_msg = run_status.last_error.message if run_status.last_error else 'UNKNOWN ERROR'
                log_entry("error", f"❌ ASSISTANT RUN FAILED: {error_msg}", {'last_error': run_status.last_error})
                raise Exception(f'ASSISTANT RUN FAILED: {error_msg}')
            
            # CHECK FOR CANCELLED STATUS
            if run_status.status == 'cancelled':
                log_entry("error", "❌ ASSISTANT RUN WAS CANCELLED")
                raise Exception('ASSISTANT RUN WAS CANCELLED')
        
        # LOG FINAL RUN STATUS
        log_entry("run_complete", f"✅ Run completed with status: {run_status.status}", {
            'run_id': run.id,
            'status': run_status.status,
            'total_attempts': attempts,
            'usage': getattr(run_status, 'usage', None)
        })
        
        # GET MESSAGES
        messages = client.beta.threads.messages.list(thread_id)
        log_entry("messages", f"📨 Retrieved {len(messages.data)} messages from thread")
        
        return messages.data
        
    except Exception as error:
        log_entry("error", f'ERROR IN SENDMESSAGE: {error}')
        raise error

def process_citations_with_logging(message_content, annotations, question_number):
    """Process citations with detailed logging of sources used"""
    citations = []
    sources_used = []
    
    log_entry("citations", f"🔍 Processing {len(annotations)} annotations for Question {question_number}")
    
    for index, annotation in enumerate(annotations):
        if annotation.type == 'file_citation' and annotation.file_citation:
            # REPLACE CITATION TEXT WITH NUMBERED REFERENCE
            original_text = annotation.text
            message_content.value = message_content.value.replace(
                annotation.text,
                f'[{index + 1}]'
            )
            
            # ADD CITATION DETAILS (exactly like lines 205-220)
            citation_text = annotation.text
            # Extract filename from citation format 【4:1†filename.pdf】
            import re
            citation_match = re.search(r'【(\d+):(\d+)†(.+?)】', citation_text)
            
            if citation_match:
                page = citation_match.group(1)
                paragraph = citation_match.group(2)
                filename = citation_match.group(3)
                page_info = f' (Page {page}, Paragraph {paragraph})'
                
                source_info = {
                    'filename': filename,
                    'page': page,
                    'paragraph': paragraph,
                    'citation_text': original_text
                }
            else:
                filename = getattr(annotation.file_citation, 'quote', 'Unknown file')
                page_info = ''
                
                source_info = {
                    'filename': filename,
                    'page': 'unknown',
                    'paragraph': 'unknown',
                    'citation_text': original_text
                }
            
            # Clean filename
            clean_filename = re.sub(r'【\d+:\d+†(.+?)】', r'\1', filename).strip()
            citation = f'[{index + 1}] {clean_filename}{page_info}'
            citations.append(citation)
            sources_used.append(source_info)
            
            log_entry("citation_detail", f"📚 Citation {index + 1}: {clean_filename}{page_info}", source_info)
    
    # LOG SUMMARY OF SOURCES
    log_entry("sources_summary", f"📊 Question {question_number} used {len(sources_used)} sources", {
        'total_citations': len(citations),
        'sources': sources_used,
        'unique_files': list(set([s['filename'] for s in sources_used]))
    })
    
    return message_content.value, citations

def test_specific_questions(assistant):
    """Test the two specific questions with detailed logging"""
    
    questions = [
        "What retractors does Dr. Costanzo use for a total knee?",
        "What is the lateral bump setup in wilmington?"
    ]
    
    # Create thread
    thread = create_thread()
    
    results = []
    
    for i, question in enumerate(questions, 1):
        log_entry("question", f"🎯 TESTING QUESTION {i}", {'question': question})
        print(f"\n{'='*80}")
        print(f"QUESTION {i}: {question}")
        print('='*80)
        
        messages = send_message_with_detailed_logging(thread.id, question, assistant.id, i)
        
        # Process response with detailed logging
        for message in messages:
            if message.role == 'assistant':
                message_content = message.content[0].text
                annotations = message_content.annotations
                
                # Log raw response details
                log_entry("response_raw", f"📝 Raw response for Question {i}", {
                    'message_id': message.id,
                    'content_length': len(message_content.value),
                    'annotation_count': len(annotations),
                    'created_at': message.created_at
                })
                
                # Process citations with logging
                response, citations = process_citations_with_logging(message_content, annotations, i)
                
                result = {
                    'question_number': i,
                    'question': question,
                    'response': response,
                    'citations': citations,
                    'message_id': message.id,
                    'annotation_count': len(annotations)
                }
                results.append(result)
                
                print(f"RESPONSE:")
                print(response)
                print(f"\nCITATIONS ({len(citations)}):")
                for citation in citations:
                    print(citation)
                print()
                
                log_entry("response_final", f"✅ Question {i} completed", {
                    'response_length': len(response),
                    'citation_count': len(citations)
                })
                break
    
    return results

def save_detailed_log(assistant, vector_store, uploaded_files, results):
    """Save comprehensive log to markdown file"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"assistant_test_log_{timestamp}.md"
    
    with open(filename, 'w') as f:
        f.write(f"# OpenAI Assistant Test Log\n")
        f.write(f"**Generated:** {datetime.now().isoformat()}\n\n")
        
        f.write(f"## Setup Summary\n")
        f.write(f"- **Assistant ID:** `{assistant.id}`\n")
        f.write(f"- **Vector Store ID:** `{vector_store.id}`\n")
        f.write(f"- **Model:** {assistant.model}\n")
        f.write(f"- **Files Uploaded:** {len(uploaded_files)}\n\n")
        
        f.write(f"### Uploaded Files\n")
        for file_info in uploaded_files:
            f.write(f"- **{file_info['filename']}**\n")
            f.write(f"  - File ID: `{file_info['file_id']}`\n")
            f.write(f"  - Path: `{file_info['path']}`\n\n")
        
        f.write(f"## Test Results\n\n")
        for result in results:
            f.write(f"### Question {result['question_number']}\n")
            f.write(f"**Q:** {result['question']}\n\n")
            f.write(f"**Response:**\n```\n{result['response']}\n```\n\n")
            f.write(f"**Citations ({len(result['citations'])}):**\n")
            for citation in result['citations']:
                f.write(f"- {citation}\n")
            f.write(f"\n")
        
        f.write(f"## Detailed Activity Log\n\n")
        for entry in log_entries:
            f.write(f"### {entry['timestamp']} - {entry['category'].upper()}\n")
            f.write(f"{entry['message']}\n")
            if entry['data']:
                f.write(f"```json\n{json.dumps(entry['data'], indent=2)}\n```\n")
            f.write(f"\n")
    
    log_entry("log_saved", f"📄 Detailed log saved to {filename}")
    return filename

def main():
    """Main function with comprehensive testing and logging"""
    log_entry("main", "🚀 Starting OpenAI Assistant Test (HHB App Method with User Notes PDF)")
    log_entry("main", f"API Key present: {'Yes' if os.getenv('OPENAI_API_KEY') else 'No'}")
    
    if not os.getenv('OPENAI_API_KEY'):
        log_entry("error", "❌ OPENAI_API_KEY ENVIRONMENT VARIABLE IS REQUIRED")
        return
    
    # Create assistant and vector store with both PDFs
    assistant, vector_store, uploaded_files = create_assistant_and_vector_store()
    
    if not assistant or not vector_store:
        log_entry("error", "❌ Failed to create assistant or vector store")
        return
    
    # Test specific questions
    results = test_specific_questions(assistant)
    
    # Save detailed log
    log_filename = save_detailed_log(assistant, vector_store, uploaded_files, results)
    
    # Output environment variables
    log_entry("completion", "🔧 ENVIRONMENT VARIABLES TO ADD:")
    print(f"\nTS_KNEE_ASSISTANT_ID={assistant.id}")
    print(f"TS_KNEE_VECTOR_STORE_ID={vector_store.id}")
    print(f"\n📝 Detailed log saved to: {log_filename}")
    print("🎉 ASSISTANT SETUP AND TESTING COMPLETE!")

if __name__ == "__main__":
    main() 