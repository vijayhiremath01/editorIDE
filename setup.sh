#!/bin/bash

echo "🚀 Setting up AI Video Editor Copilot..."

# Create media folder
echo "📁 Creating media folder..."
mkdir -p media

# Backend setup
echo "🐍 Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "✅ Backend setup complete!"
cd ..

# Frontend setup
echo "⚛️  Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

echo "✅ Frontend setup complete!"
cd ..

echo ""
echo "✨ Setup complete!"
echo ""
echo "To run the application:"
echo "  1. Backend: cd backend && source venv/bin/activate && python main.py"
echo "  2. Frontend: cd frontend && npm run dev"
echo ""
echo "Don't forget to set your OPENAI_API_KEY in backend/.env (optional)"

