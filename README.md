# Rahman AI Student Success Agent

Rahman AI Student Success Agent is an AI-powered learning assistant designed to help students turn their learning goals into a practical and personalized learning journey.

The application analyzes a student's learning goal, current level, available study time, and target duration to generate a learning roadmap and study plan. It also provides targeted practice, assessments, performance feedback, and AI coaching.

## Features

- Personalized learning goal analysis
- AI-generated learning roadmap
- Stage-by-stage study plan
- Daily study-time planning
- Study-plan feasibility checking
- Targeted practice activities
- Practice hints and answers
- Topic-based assessments
- Assessment scoring
- Performance analysis
- Strength and focus-area identification
- Next-best-action recommendations
- Context-aware AI coaching
- Structured AI response validation
- Error handling for common AI service problems

## How It Works

The student provides:

1. Learning goal
2. Current level
3. Available study minutes per day
4. Target duration in days

Rahman AI then creates a personalized learning journey.

### 1. Goal Analysis

The application analyzes the learning goal and identifies:

- Required knowledge
- Prerequisites
- Core topics
- Recommended learning order
- Practice requirements
- Assessment points

### 2. Learning Roadmap

The learning goal is divided into practical stages.

Each stage contains:

- Stage title
- Learning objective
- Estimated study time
- Practice task
- Starting status

### 3. Study Plan

The application converts the roadmap into a practical study schedule based on the student's available daily study time.

For example, with 30 minutes available per day:

```text
Learn       15 minutes
Practice     9 minutes
Review       6 minutes
----------------------
Total       30 minutes
```

The application also checks whether the requested duration is sufficient for the roadmap and calculates the minimum number of days needed when necessary.

### 4. Targeted Practice

Students can select a roadmap topic and receive a practice activity.

Supported practice types include:

- Predict the output
- Find the error
- Complete the code
- Write a program
- Explain a concept
- Conceptual question

Practice activities can include a starter code section, hint, and answer.

### 5. Assessment

Students can take topic-based assessments to check their understanding.

Assessments support:

- Multiple-choice questions
- Short-answer questions

The assessment result is used to provide meaningful learning feedback.

### 6. Performance Analysis

After completing an assessment, the application can provide:

- Assessment score
- Number of correct answers
- Strengths
- Areas that need more attention
- Recommended focus areas

### 7. AI Coach

The AI Coach provides guidance based on the student's learning context and performance.

For example, if a student is struggling with loops, the coach can recommend specific exercises involving `for` loops, `while` loops, conditions, and loop-control techniques.

## Technology Stack

### Frontend

- HTML
- CSS
- JavaScript

### Backend

- Node.js
- Express.js

### AI

- Hugging Face Inference API
- Qwen/Qwen2.5-7B-Instruct-1M

## Project Structure

```text
rahman-ai-student-success-agent/
│
├── server.js
├── agent.js
├── hf.js
├── validate.js
├── package.json
├── .gitignore
├── .env.example
└── README.md
```

The project may also contain frontend files or folders depending on the current version of the application.

## Requirements

Before running the project locally, make sure you have:

- Node.js installed
- npm installed
- A Hugging Face account
- A Hugging Face access token with the required inference access

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/rahman-ai-student-success-agent.git
cd rahman-ai-student-success-agent
```

Replace `YOUR-USERNAME` with your GitHub username.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

Add:

```env
HF_TOKEN=your_hugging_face_token
HF_MODEL=Qwen/Qwen2.5-7B-Instruct-1M
```

Replace `your_hugging_face_token` with your own Hugging Face token.

### 4. Start the application

```bash
npm start
```

The application runs locally at:

```text
http://localhost:3000
```

Open this address in your browser.

## Environment Variables

The application uses environment variables for AI configuration.

| Variable | Description |
|---|---|
| `HF_TOKEN` | Hugging Face authentication token |
| `HF_MODEL` | Hugging Face model used by the application |

Example:

```env
HF_TOKEN=your_hugging_face_token
HF_MODEL=Qwen/Qwen2.5-7B-Instruct-1M
```

## Security

Never commit your `.env` file to GitHub.

The `.env` file contains a private authentication token and should remain on your local machine or be stored securely in the deployment platform's environment variables.

The `.env.example` file is included to show which environment variables are required without exposing the actual token.

## AI Response Validation

The project validates important AI-generated responses before using them in the application.

Validation is applied to:

- Goal analysis
- Roadmap stages
- Study plans
- Practice activities
- Assessment questions

The validation layer checks required fields, data types, allowed values, and expected response structures.

The study planner also performs a deterministic check to make sure the generated daily study blocks match the student's available daily study time.

## Error Handling

The application includes handling for common Hugging Face problems, including:

- Missing Hugging Face token
- Authentication errors
- Rate limiting
- Exhausted inference credits
- Model availability problems
- Empty AI responses
- Invalid structured AI responses

Where possible, technical errors are converted into clearer messages for the user.

## Example

A student can enter:

```text
Learning goal:
I want to learn Python fundamentals

Current level:
Beginner

Minutes per day:
30

Target duration:
30 days
```

The application can then generate a personalized roadmap covering topics such as:

```text
Introduction to Python
Variables and Data Types
Control Structures
Functions
Data Structures
Error Handling
Project Development
```

The generated roadmap depends on the student's goal and current level.

## Learning Workflow

```text
Learning Goal
      ↓
Goal Analysis
      ↓
Learning Roadmap
      ↓
Study Plan
      ↓
Targeted Practice
      ↓
Assessment
      ↓
Performance Analysis
      ↓
AI Coach
      ↓
Next Best Action
```

This workflow connects planning, practice, assessment, performance feedback, and AI guidance in one learning experience.

## Testing the Application

A basic test flow is:

1. Enter a learning goal.
2. Select the current level.
3. Enter the available daily study time.
4. Enter the target duration.
5. Click **Build My Learning Path**.
6. Review the generated goal analysis and roadmap.
7. Generate the study plan.
8. Check that the daily study blocks do not exceed the available daily time.
9. Select a topic under **Targeted Practice**.
10. Complete a practice activity.
11. Start an assessment.
12. Submit the assessment answers.
13. Review the performance results.
14. Ask the AI Coach for guidance.

## Running the Project

After configuring the environment, run:

```bash
npm start
```

A successful startup should display a message similar to:

```text
Rahman AI Student Success Agent running at http://localhost:3000
```

Then open:

```text
http://localhost:3000
```

in your browser.

## Deployment

Rahman AI Student Success Agent can be deployed to a Node.js-compatible hosting platform such as Railway.

For deployment, configure the required environment variables in the hosting platform:

```env
HF_TOKEN=your_hugging_face_token
HF_MODEL=Qwen/Qwen2.5-7B-Instruct-1M
```

Do not upload or expose the `.env` file.

After deployment, use the URL provided by the hosting platform to access the application.

## Future Improvements

Possible future improvements include:

- Student authentication
- Persistent student profiles
- Database-backed progress tracking
- Learning history
- More assessment formats
- Detailed progress dashboards
- Additional learning subjects
- Support for additional AI models
- More personalized long-term recommendations
- Expanded project-based learning activities

## Project Purpose

The purpose of Rahman AI Student Success Agent is to provide students with a structured and personalized way to plan, practice, assess, and improve their learning.

Instead of providing only individual answers, the application connects learning goals, roadmap planning, study scheduling, targeted practice, assessments, performance feedback, and AI coaching into one learning workflow.

## Author

**Muqaddas Zaheer Ahmad**

BS Artificial Intelligence Student

**University Capstone Project**

## License

This project was developed for educational and academic purposes.
