@echo off
cd py_asr_service

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install/update requirements
echo Installing Python dependencies...
pip install -r requirements.txt

REM Start the server
echo Starting Python ASR server on port 5689...
uvicorn server:app --host 0.0.0.0 --port 5689