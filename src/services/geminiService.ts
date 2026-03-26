import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const tutorModel = "gemini-3-flash-preview";

export interface LessonContent {
  explanation: string;
  technicalAnalysis: string;
  interactiveExample: string;
  theoryQuestions: { question: string; options: string[]; answer: string }[];
  miniExercise: string;
  codeTemplate?: string;
  correctAnswer: string;
  concept: string;
  bestPractices: string;
  commonErrors: string;
  complexityAnalysis?: string;
}

export async function getNextLesson(language: string, currentConcept: string): Promise<LessonContent> {
  const prompt = `Sei un Tutor di Programmazione esperto. L'utente sta imparando ${language}. 
  Il concetto attuale è: ${currentConcept}.
  
  STRUTTURA DELLA SPIEGAZIONE (MANDATORIA):
  1. TEORIA: Spiegazione concettuale chiara e approfondita.
  2. ANALISI TECNICA: Come funziona sotto il cofano, gestione memoria, performance.
  3. ESEMPIO INTERATTIVO: Un caso d'uso pratico spiegato passo passo.
  4. CHECK DI COMPRENSIONE: Introduzione alle domande che seguiranno.
  
  ALTRI CONTENUTI RICHIESTI:
  - BEST PRACTICES: Come scrivere codice professionale.
  - ERRORI COMUNI: Cosa evitare.
  - DOMANDE TEORICHE: 2 domande a risposta chiusa (A, B, C).
  - MINI-ESERCIZIO: 1 esercizio pratico.
  - CODE TEMPLATE: Se l'esercizio è complesso, fornisci uno scheletro di codice con commenti dove l'utente deve scrivere.
  
  Genera tutto in formato JSON.
  
  Struttura JSON:
  {
    "explanation": "Sezione Teoria (Markdown)",
    "technicalAnalysis": "Sezione Analisi Tecnica (Markdown)",
    "interactiveExample": "Sezione Esempio Interattivo (Markdown)",
    "bestPractices": "Elenco puntato Markdown",
    "commonErrors": "Elenco puntato Markdown",
    "theoryQuestions": [
      { "question": "Domanda 1", "options": ["A", "B", "C"], "answer": "A" },
      { "question": "Domanda 2", "options": ["A", "B", "C"], "answer": "B" }
    ],
    "miniExercise": "Testo dell'esercizio",
    "codeTemplate": "Codice template (opzionale)",
    "correctAnswer": "Codice esatto",
    "concept": "Nome Modulo"
  }`;

  const response = await ai.models.generateContent({
    model: tutorModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanation: { type: Type.STRING },
          technicalAnalysis: { type: Type.STRING },
          interactiveExample: { type: Type.STRING },
          bestPractices: { type: Type.STRING },
          commonErrors: { type: Type.STRING },
          theoryQuestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                answer: { type: Type.STRING }
              },
              required: ["question", "options", "answer"]
            }
          },
          miniExercise: { type: Type.STRING },
          codeTemplate: { type: Type.STRING },
          correctAnswer: { type: Type.STRING },
          concept: { type: Type.STRING }
        },
        required: ["explanation", "technicalAnalysis", "interactiveExample", "bestPractices", "commonErrors", "theoryQuestions", "miniExercise", "correctAnswer", "concept"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function getExtraExplanation(language: string, concept: string, errorCount: number): Promise<string> {
  const prompt = `L'utente ha sbagliato l'esercizio su "${concept}" (${language}) per ${errorCount} volte.
  Genera una spiegazione supplementare estremamente dettagliata, usando analogie diverse e più semplici per chiarire il concetto.
  Restituisci solo testo Markdown.`;

  const response = await ai.models.generateContent({
    model: tutorModel,
    contents: prompt
  });

  return response.text || "";
}

export async function streamExtraExplanation(
  language: string, 
  concept: string, 
  errorCount: number,
  onChunk: (text: string) => void
): Promise<void> {
  const prompt = `L'utente ha sbagliato l'esercizio su "${concept}" (${language}) per ${errorCount} volte.
  Genera una spiegazione supplementare estremamente dettagliata, usando analogie diverse e più semplici per chiarire il concetto.
  Restituisci solo testo Markdown.`;

  const response = await ai.models.generateContentStream({
    model: tutorModel,
    contents: prompt
  });

  let fullText = "";
  for await (const chunk of response) {
    fullText += chunk.text;
    onChunk(fullText);
  }
}

export async function analyzeAnswer(language: string, exercise: string, userAnswer: string, correctAnswer: string): Promise<{ isCorrect: boolean; feedback: string; explanation?: string; suggestion?: string }> {
  const prompt = `Valuta la risposta dell'utente per questo esercizio di ${language}.
  Esercizio: ${exercise}
  Risposta corretta attesa: ${correctAnswer}
  Risposta utente: ${userAnswer}
  
  Se la risposta è SBAGLIATA:
  1. Spiega in modo costruttivo PERCHÉ è sbagliata (analisi dell'errore).
  2. Fornisci la soluzione corretta o un suggerimento molto forte su come arrivarci.
  
  Rispondi in JSON con:
  - "isCorrect": boolean
  - "feedback": stringa breve (es. "Quasi!", "Ottimo!", "Riprova")
  - "explanation": spiegazione dettagliata dell'errore (Markdown) - solo se isCorrect è false
  - "suggestion": la soluzione corretta o il suggerimento risolutivo (Markdown) - solo se isCorrect è false`;

  const response = await ai.models.generateContent({
    model: tutorModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isCorrect: { type: Type.BOOLEAN },
          feedback: { type: Type.STRING },
          explanation: { type: Type.STRING },
          suggestion: { type: Type.STRING }
        },
        required: ["isCorrect", "feedback"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export interface ExamProblem {
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface ExamResult {
  score: number;
  feedback: string;
  passed: boolean;
  suggestions: string[];
}

export async function getExamBattery(language: string): Promise<ExamProblem[]> {
  const prompt = `Genera una "Batteria d'Esame" per il linguaggio ${language}.
  Deve contenere almeno 5 problemi complessi che coprono:
  1. Logica di base
  2. Gestione dati
  3. Algoritmi
  4. Funzioni/Classi
  5. Un caso d'uso pratico (Real-world scenario)
  
  Restituisci un array JSON di oggetti con "title", "description" (Markdown) e "difficulty".`;

  const response = await ai.models.generateContent({
    model: tutorModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard'] }
          },
          required: ["title", "description", "difficulty"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function analyzeExam(language: string, examProblems: ExamProblem[], files: { name: string, content: string }[]): Promise<ExamResult> {
  const problemsText = examProblems.map((p, i) => `Problema ${i+1}: ${p.title}\n${p.description}`).join("\n\n");
  const filesContent = files.map(f => `File: ${f.name}\nContent:\n${f.content}`).join("\n\n---\n\n");
  
  const prompt = `Analizza l'esame finale di ${language} con MASSIMA SEVERITÀ (Standard Universitario).
  
  PROBLEMI PROPOSTI:
  ${problemsText}
  
  FILE CARICATI DALL'UTENTE:
  ${filesContent}
  
  REGOLE DI VALUTAZIONE (ESTREMAMENTE RIGIDE):
  1. CORRETTEZZA FUNZIONALE: Il codice deve risolvere il problema al 100%. Errori logici pesano gravemente.
  2. QUALITÀ DEL CODICE: Valuta naming convention, modularità e leggibilità.
  3. EFFICIENZA: Algoritmi inefficienti (es. O(n^2) dove O(n) è possibile) riducono il punteggio.
  4. COMMENTI E DOCUMENTAZIONE: Il codice non commentato o mal documentato non può ottenere il massimo dei voti.
  5. FORMATTAZIONE: Indentazione inconsistente o stile sciatto penalizzano il risultato.
  
  Restituisci un punteggio da 0 a 100, se è passato (score >= 60), feedback critico e costruttivo, e una lista di suggerimenti specifici.`;

  const response = await ai.models.generateContent({
    model: tutorModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          passed: { type: Type.BOOLEAN },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["score", "feedback", "passed", "suggestions"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}
