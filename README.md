# HHB Assistant

**Date:** September 2025 
**Version:** 1.0

## Summary

AI-powered team collaboration platform designed for medical device sales representatives and field operations teams.

## Features

- Team-based AI assistants with document knowledge bases
- Portfolio management and document processing
- Real-time chat interface with context-aware responses
- Team collaboration and invitation system
- Admin dashboard with analytics
- Secure authentication via Supabase

## Tech Stack

- Next.js 15 with React 19
- TypeScript
- Supabase (auth, database)
- OpenAI GPT-4 (AI assistant)
- Tailwind CSS
- LlamaParse (document processing)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see `.env.example`)

3. Run development server:
```bash
npm run dev
```

## Project Structure

- `app/` - Next.js app router pages and API routes
- `app/components/` - React components
- `app/services/` - Business logic and external service integrations
- `app/contexts/` - React context providers
- `app/utils/` - Utility functions and helpers

## Deployment

The application is configured for deployment on Vercel with security headers and CORS policies.

---

**Document Version:** 1.0  
**Last Updated:** December 2024
