import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Code2, 
  BookOpen, 
  ChevronRight, 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  RefreshCcw, 
  Loader2, 
  GraduationCap, 
  Upload,
  Send,
  Save,
  FileSearch,
  Lightbulb,
  Trophy
} from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  getNextLesson, 
  getExamBattery, 
  analyzeExam, 
  analyzeAnswer, 
  getExtraExplanation,
  streamExtraExplanation,
  type LessonContent, 
  type ExamProblem 
} from './services/geminiService';

type AppState = 'selection' | 'lesson' | 'exam' | 'result';

const LANGUAGES = ['Python', 'JavaScript', 'C++', 'Java', 'SQL'];
const CONCEPTS = [
  'Dichiarazione', 'Tipi di dato', 'Naming Convention', 'Scope', 
  'Operatori', 'Stringhe', 'Liste/Array', 'Dizionari/Mappe', 
  'If/Else', 'Cicli For', 'Cicli While', 'Funzioni', 
  'Parametri e Return', 'Classi e Oggetti', 'Ereditarietà', 'Gestione Errori'
];

interface ExamResult {
  score: number;
  feedback: string;
  passed: boolean;
  suggestions: string[];
}

export default function App() {
  const [state, setState] = useState<AppState>('selection');
  const [language, setLanguage] = useState('');
  const [conceptIndex, setConceptIndex] = useState(0);
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; text: string; explanation?: string; suggestion?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [examFiles, setExamFiles] = useState<{ name: string; content: string }[]>([]);
  const [exam, setExam] = useState<ExamProblem[] | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [welcomeMessage, setWelcomeMessage] = useState('');
  
  // New states for V2.2
  const [theoryStep, setTheoryStep] = useState(0); // 0: Theory, 1: Q1, 2: Q2, 3: Practical
  const [retryCount, setRetryCount] = useState(0);
  const [extraExplanation, setExtraExplanation] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [allProgress, setAllProgress] = useState<Record<string, number>>({});

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistence logic
  const saveProgress = (lang: string, index: number) => {
    localStorage.setItem(`progress_${lang}`, index.toString());
    updateAllProgress();
  };

  const getProgress = (lang: string) => {
    return parseInt(localStorage.getItem(`progress_${lang}`) || '0');
  };

  const updateAllProgress = () => {
    const progress: Record<string, number> = {};
    LANGUAGES.forEach(lang => {
      progress[lang] = Math.round((getProgress(lang) / CONCEPTS.length) * 100);
    });
    setAllProgress(progress);
  };

  useEffect(() => {
    updateAllProgress();
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lesson, feedback, exam, theoryStep, extraExplanation]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  
  const goHome = () => {
    setState('selection');
    setLanguage('');
    setConceptIndex(0);
    setLesson(null);
    setFeedback(null);
    setUserAnswer('');
    setExamFiles([]);
    setExamResult(null);
    setWelcomeMessage('');
    setTheoryStep(0);
    setRetryCount(0);
    setExtraExplanation('');
    updateAllProgress();
  };

  const startLearning = async (lang: string, jumpToIdx?: number) => {
    setLanguage(lang);
    setLoading(true);
    const savedIdx = jumpToIdx !== undefined ? jumpToIdx : getProgress(lang);
    
    if (savedIdx > 0) {
      setWelcomeMessage(`Bentornato! Ultimo argomento superato: ${CONCEPTS[savedIdx - 1]}. La tua progressione è al ${Math.round((savedIdx / CONCEPTS.length) * 100)}%`);
    } else {
      setWelcomeMessage('');
    }

    try {
      const currentIdx = savedIdx < CONCEPTS.length ? savedIdx : 0;
      const firstLesson = await getNextLesson(lang, CONCEPTS[currentIdx]);
      setLesson(firstLesson);
      setConceptIndex(currentIdx);
      setTheoryStep(0);
      setRetryCount(0);
      setExtraExplanation('');
      setState('lesson');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCommand = (input: string) => {
    const cmd = input.trim().toLowerCase();
    if (cmd === '/home') {
      goHome();
      return true;
    }
    if (cmd === '/tema') {
      toggleTheme();
      setUserAnswer('');
      return true;
    }
    if (cmd.startsWith('/vai ')) {
      const lang = cmd.split(' ')[1];
      const found = LANGUAGES.find(l => l.toLowerCase() === lang);
      if (found) {
        startLearning(found);
        setUserAnswer('');
        return true;
      }
    }
    return false;
  };

  const handleAnswer = async () => {
    if (handleCommand(userAnswer)) return;

    if (!userAnswer.trim() || !lesson) return;
    
    setLoading(true);
    try {
      if (theoryStep === 1 || theoryStep === 2) {
        const qIdx = theoryStep - 1;
        const q = lesson.theoryQuestions[qIdx];
        const isCorrect = userAnswer.trim().toUpperCase() === q.answer.toUpperCase();
        
        if (isCorrect) {
          setFeedback({ 
            isCorrect: true, 
            text: `Ottimo! Risposta teorica corretta. 💾 Checkpoint aggiornato: ${language} al ${Math.round(progress)}%` 
          });
        } else {
          setFeedback({ 
            isCorrect: false, 
            text: `Ops! La risposta corretta era ${q.answer}.`,
            explanation: `Hai scelto un'opzione non corretta. In questo contesto, la risposta "${q.answer}" è quella che meglio descrive il concetto di ${lesson.concept}.`,
            suggestion: `Rileggi attentamente la sezione "Teoria" e "Analisi Tecnica" per capire meglio questo punto specifico.`
          });
        }
      } else {
        const result = await analyzeAnswer(language, lesson.miniExercise, userAnswer, lesson.correctAnswer);
        setFeedback({ 
          isCorrect: result.isCorrect, 
          text: result.isCorrect 
            ? `${result.feedback} 💾 Checkpoint aggiornato: ${language} al ${Math.round(progress)}%` 
            : result.feedback,
          explanation: result.explanation,
          suggestion: result.suggestion
        });
        
        if (result.isCorrect) {
          setRetryCount(0);
        } else {
          const newRetry = retryCount + 1;
          setRetryCount(newRetry);
          if (newRetry >= 2) {
            setIsStreaming(true);
            setExtraExplanation('');
            await streamExtraExplanation(language, lesson.concept, newRetry, (text) => {
              setExtraExplanation(text);
            });
            setIsStreaming(false);
          }
        }
      }
    } catch (error) {
      console.error(error);
      setIsStreaming(false);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async () => {
    setFeedback(null);
    setUserAnswer('');
    setWelcomeMessage('');
    
    if (theoryStep < 3) {
      setTheoryStep(theoryStep + 1);
      return;
    }

    // If we finished the practical exercise (theoryStep === 3)
    setExtraExplanation('');
    setRetryCount(0);
    setTheoryStep(0);
    
    if (conceptIndex < CONCEPTS.length - 1) {
      setLoading(true);
      try {
        const nextIdx = conceptIndex + 1;
        saveProgress(language, nextIdx);
        const nextLsn = await getNextLesson(language, CONCEPTS[nextIdx]);
        setLesson(nextLsn);
        setConceptIndex(nextIdx);
        setWelcomeMessage(`Checkpoint Creato: ${lesson?.concept}`);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        saveProgress(language, CONCEPTS.length);
        const battery = await getExamBattery(language);
        setExam(battery);
        setState('exam');
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setExamFiles(prev => [...prev, { name: file.name, content: event.target?.result as string }]);
      };
      reader.readAsText(file);
    });
  };

  const submitExam = async () => {
    if (examFiles.length === 0 || !exam) return;
    setLoading(true);
    try {
      const result = await analyzeExam(language, exam, examFiles);
      setExamResult(result);
      setState('result');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const progress = ((conceptIndex + (theoryStep / 4)) / CONCEPTS.length) * 100;
  const progressBlocks = Math.floor(progress / 5); // 20 blocks total for the footer version
  const progressBarStylized = `[${'█'.repeat(progressBlocks)}${'░'.repeat(20 - progressBlocks)}]`;

  const langIcons: Record<string, string> = {
    'Python': '🐍',
    'JavaScript': '🌐',
    'C++': '⚙️',
    'Java': '☕',
    'SQL': '🗄️'
  };

  return (
    <div className={cn("min-h-screen flex flex-col transition-colors duration-300 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100")}>
      {/* Header */}
      <header className="h-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex flex-col px-6 sticky top-0 z-20">
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={goHome}
              className="w-8 h-8 bg-indigo-600 dark:bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:scale-105 transition-transform"
            >
              <Terminal className="text-white w-5 h-5" />
            </button>
            <h1 className="font-bold text-lg tracking-tight hidden sm:block">CodeTutor AI</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-700">
              <span>🕒 {currentTime}</span>
              <span className="opacity-30">|</span>
              <span>💾 SALVATAGGI:</span>
              {LANGUAGES.map(lang => (
                <span key={lang} className="flex items-center gap-1">
                  {langIcons[lang]} {allProgress[lang] || 0}%
                </span>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Cambia Tema"
              >
                {isDarkMode ? <span className="text-xl">🌙</span> : <span className="text-xl">☀️</span>}
              </button>
              <button 
                onClick={goHome}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors sm:hidden"
                title="Home"
              >
                <RefreshCcw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6" ref={scrollRef}>
        {loading && !isStreaming && (
          <div className="fixed inset-0 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-4"
            >
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 animate-pulse uppercase tracking-widest">Il Tutor sta elaborando...</p>
            </motion.div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {state === 'selection' && (
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 py-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-extrabold tracking-tight">
                  Dashboard di Controllo
                </h2>
                <p className="text-xl text-zinc-500 dark:text-zinc-400">Seleziona un modulo per iniziare o riprendere.</p>
                
                <div className="max-w-md mx-auto bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    <span>Barra dei Salvataggi</span>
                    <Save className="w-3 h-3" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    {LANGUAGES.map(lang => (
                      <button 
                        key={lang}
                        onClick={() => startLearning(lang)}
                        className="flex items-center gap-2 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-500 transition-all text-xs font-medium"
                      >
                        <span className="opacity-70">{langIcons[lang]}</span>
                        <span>{lang}</span>
                        <span className="text-indigo-500 font-bold">{allProgress[lang] || 0}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => startLearning(lang)}
                    disabled={loading}
                    className="group p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-indigo-500 hover:shadow-2xl transition-all text-left flex flex-col gap-4 disabled:opacity-50 relative overflow-hidden"
                  >
                    <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors">
                      <span className="text-2xl">{langIcons[lang]}</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{lang}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${allProgress[lang] || 0}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400">{allProgress[lang] || 0}%</span>
                      </div>
                    </div>
                    {allProgress[lang] === 100 && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {state === 'lesson' && lesson && (
            <motion.div 
              key="lesson"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 pb-24"
            >
              {welcomeMessage && (
                <div className="bg-indigo-100 dark:bg-indigo-900/40 p-4 rounded-xl text-indigo-800 dark:text-indigo-200 text-sm font-medium border border-indigo-200 dark:border-indigo-800 flex items-center gap-3">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                  {welcomeMessage}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm uppercase tracking-wider">
                  <BookOpen className="w-4 h-4" />
                  <span>{lesson.concept}</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-400">
                   📊 PROGRESSO CORSO: {Math.round(progress)}%
                </div>
              </div>

              {theoryStep === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm space-y-8">
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold border-l-4 border-indigo-500 pl-4">Teoria</h3>
                      <div className="markdown-body">
                        <Markdown>{lesson.explanation}</Markdown>
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-xl font-bold border-l-4 border-amber-500 pl-4">Analisi Tecnica</h3>
                      <div className="markdown-body p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                        <Markdown>{lesson.technicalAnalysis}</Markdown>
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-xl font-bold border-l-4 border-emerald-500 pl-4">Esempio Interattivo</h3>
                      <div className="markdown-body">
                        <Markdown>{lesson.interactiveExample}</Markdown>
                      </div>
                    </section>

                    <section className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
                      <p className="text-sm text-zinc-500 italic">Pronto per il check di comprensione? Analizzeremo quanto appreso con due domande rapide.</p>
                    </section>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-2xl p-6">
                      <h4 className="font-bold text-emerald-900 dark:text-emerald-300 mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Best Practices
                      </h4>
                      <div className="text-sm text-emerald-800 dark:text-emerald-100/80 markdown-body">
                        <Markdown>{lesson.bestPractices}</Markdown>
                      </div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/50 rounded-2xl p-6">
                      <h4 className="font-bold text-rose-900 dark:text-rose-300 mb-3 flex items-center gap-2">
                        <XCircle className="w-4 h-4" /> Errori Comuni
                      </h4>
                      <div className="text-sm text-rose-800 dark:text-rose-100/80 markdown-body">
                        <Markdown>{lesson.commonErrors}</Markdown>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={nextStep}
                    className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    Inizia Test di Controllo <ArrowRight className="w-5 h-5" />
                  </button>
                </motion.div>
              )}

              {(theoryStep === 1 || theoryStep === 2) && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-6"
                >
                  <div className="flex items-center gap-2 text-indigo-600 font-bold">
                    <span className="bg-indigo-100 dark:bg-indigo-500/20 px-2 py-1 rounded text-xs">DOMANDA {theoryStep}/2</span>
                    <h3>Verifica Teorica</h3>
                  </div>
                  <p className="text-lg font-medium">{lesson.theoryQuestions[theoryStep-1].question}</p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {lesson.theoryQuestions[theoryStep-1].options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setUserAnswer(opt)}
                        className={cn(
                          "p-4 rounded-xl border text-left transition-all",
                          userAnswer === opt 
                            ? "bg-indigo-600 border-indigo-600 text-white" 
                            : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-500"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={handleAnswer}
                    disabled={loading || !userAnswer}
                    className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Conferma Risposta"}
                  </button>
                </motion.div>
              )}

              {theoryStep === 3 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {extraExplanation && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-500/20 rounded-2xl p-8 markdown-body">
                      <h4 className="text-amber-900 dark:text-amber-400 font-bold mb-4 flex items-center gap-2">
                        <BookOpen className="w-5 h-5" /> Spiegazione Supplementare (Approfondimento)
                        {isStreaming && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                      </h4>
                      <div className="relative">
                        <Markdown>{extraExplanation}</Markdown>
                        {isStreaming && (
                          <motion.span 
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="inline-block w-2 h-4 bg-amber-500 ml-1 align-middle"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-8 space-y-4">
                    <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-bold">
                      <ChevronRight className="w-5 h-5" />
                      <h3>Mini-Esercizio Pratico</h3>
                    </div>
                    <p className="text-indigo-800 dark:text-zinc-300">{lesson.miniExercise}</p>
                    
                    {lesson.codeTemplate && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Template di Codice:</p>
                        <div className="relative group">
                          <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-xl font-mono text-xs border border-zinc-800 overflow-x-auto">
                            {lesson.codeTemplate}
                          </pre>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded">Copia e incolla sotto</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-500 italic">"Copia il blocco qui sopra e scrivi il tuo codice all'interno dei commenti, poi incolla tutto nel box della chat"</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAnswer()}
                        placeholder="Scrivi il codice..."
                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <button 
                        onClick={handleAnswer}
                        disabled={loading || !userAnswer.trim()}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                        Verifica
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {feedback && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "p-6 rounded-2xl border flex flex-col gap-4 shadow-lg",
                    feedback.isCorrect 
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" 
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-300"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      feedback.isCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                    )}>
                      {feedback.isCorrect ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <h4 className="font-bold text-lg">{feedback.isCorrect ? "Ottimo lavoro!" : "Non proprio..."}</h4>
                      <p className="text-sm opacity-90 leading-relaxed">{feedback.text}</p>
                    </div>
                  </div>

                  {!feedback.isCorrect && (
                    <div className="space-y-4 mt-2">
                      {feedback.explanation && (
                        <div className="bg-rose-100/50 dark:bg-rose-900/20 p-4 rounded-xl border border-rose-200/50 dark:border-rose-800/50">
                          <h5 className="text-xs font-bold uppercase tracking-widest text-rose-700 dark:text-rose-400 mb-2 flex items-center gap-2">
                            <Lightbulb className="w-3 h-3" /> Perché è sbagliato?
                          </h5>
                          <div className="text-sm markdown-body">
                            <Markdown>{feedback.explanation}</Markdown>
                          </div>
                        </div>
                      )}
                      {feedback.suggestion && (
                        <div className="bg-indigo-50 dark:bg-indigo-950/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                          <h5 className="text-xs font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-400 mb-2 flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3" /> Soluzione / Suggerimento
                          </h5>
                          <div className="text-sm markdown-body">
                            <Markdown>{feedback.suggestion}</Markdown>
                          </div>
                        </div>
                      )}
                      <button 
                        onClick={() => {
                          setFeedback(null);
                          setUserAnswer('');
                        }}
                        className="w-full bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
                      >
                        Riprova <RefreshCcw className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {feedback.isCorrect && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 rounded-full self-start">
                        <Save className="w-3 h-3" /> Checkpoint Creato: {lesson.concept}
                      </div>
                      <button 
                        onClick={nextStep}
                        className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                      >
                        Prosegui <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {state === 'exam' && exam && (
            <motion.div 
              key="exam"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8 pb-24"
            >
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-400 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-widest border border-amber-200 dark:border-amber-800">
                  <GraduationCap className="w-5 h-5" /> Sessione d'Esame Finale
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight">Batteria di Test: {language}</h2>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
                  Hai completato tutti i moduli. Ora affronta questi problemi reali per ottenere la certificazione. 
                  Svolgi gli esercizi nel tuo editor locale, salva i file e caricali qui per la valutazione.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {exam.map((problem, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Problema {i + 1}</span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded",
                        problem.difficulty === 'Easy' ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" :
                        problem.difficulty === 'Medium' ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400"
                      )}>
                        {problem.difficulty}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold">{problem.title}</h3>
                    <div className="markdown-body text-zinc-600 dark:text-zinc-300">
                      <Markdown>{problem.description}</Markdown>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-500/20 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Upload className="w-6 h-6" /> Consegna Elaborati
                  </h3>
                  <p className="text-indigo-100 text-sm">
                    Carica i tuoi file di codice (.py, .js, .cpp, .java, .sql, .txt). 
                    Verranno valutati per correttezza, efficienza, commenti e stile.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <input 
                    type="file" 
                    multiple 
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-indigo-100
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-white file:text-indigo-600
                      hover:file:bg-indigo-50"
                  />
                  
                  <button 
                    onClick={submitExam}
                    disabled={loading || examFiles.length === 0}
                    className="w-full bg-white text-indigo-600 py-4 rounded-xl font-bold hover:bg-indigo-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Invia per Valutazione Finale
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {state === 'result' && examResult && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 py-12"
            >
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-6">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-bold">Risultato Valutazione</h3>
                    <p className="text-sm text-zinc-400 font-mono uppercase tracking-widest">Certificazione {language}</p>
                  </div>
                  <div className={cn(
                    "text-4xl font-black px-8 py-4 rounded-2xl shadow-inner",
                    examResult.passed ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                  )}>
                    {examResult.score}/100
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="font-bold text-zinc-400 uppercase tracking-widest text-xs flex items-center gap-2">
                      <FileSearch className="w-4 h-4" /> Analisi Dettagliata
                    </h4>
                    <div className="markdown-body p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                      <Markdown>{examResult.feedback}</Markdown>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-bold text-zinc-400 uppercase tracking-widest text-xs mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" /> Suggerimenti di Miglioramento
                      </h4>
                      <ul className="space-y-3">
                        {examResult.suggestions.map((s, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 p-3 rounded-xl border border-zinc-100 dark:border-zinc-700 shadow-sm">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {examResult.passed && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800 p-8 rounded-2xl text-center space-y-4 shadow-lg shadow-emerald-500/5">
                        <Trophy className="w-16 h-16 text-emerald-500 mx-auto animate-bounce" />
                        <h4 className="text-2xl font-bold text-emerald-900 dark:text-emerald-400">Congratulazioni!</h4>
                        <p className="text-sm text-emerald-800 dark:text-zinc-300 leading-relaxed">
                          Hai superato brillantemente l'esame di {language}. Il tuo codice ha dimostrato maturità e competenza.
                        </p>
                        <button 
                          onClick={goHome}
                          className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                        >
                          Torna alla Dashboard
                        </button>
                      </div>
                    )}
                    {!examResult.passed && (
                      <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-800 p-8 rounded-2xl text-center space-y-4">
                        <RefreshCcw className="w-12 h-12 text-rose-500 mx-auto" />
                        <h4 className="text-xl font-bold text-rose-900 dark:text-rose-400">Non mollare!</h4>
                        <p className="text-sm text-rose-800 dark:text-zinc-300">
                          L'esame era complesso. Rivedi i suggerimenti e riprova quando ti senti pronto.
                        </p>
                        <button 
                          onClick={() => setState('exam')}
                          className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
                        >
                          Riprova l'Esame
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Progress Bar Footer (Stylized) */}
      {state === 'lesson' && lesson && (
        <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 z-30">
          <div className="max-w-4xl mx-auto font-mono text-[10px] sm:text-xs space-y-1">
            <div className="text-zinc-400 opacity-50">--------------------------------------------</div>
            <div className="flex justify-between items-center">
              <span className="text-indigo-500 font-bold">📖 MODULO: {lesson.concept}</span>
              <span className="text-zinc-500">🕒 {currentTime}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 font-bold">📈 PROGRESSO:</span>
              <span className="text-zinc-400">0%</span>
              <span className="text-indigo-600 dark:text-indigo-400 tracking-tighter">
                {progressBarStylized}
              </span>
              <span className="text-zinc-400">100%</span>
              <span className="ml-auto font-bold text-indigo-500">{Math.round(progress)}%</span>
            </div>
            <div className="text-zinc-400 opacity-50">--------------------------------------------</div>
          </div>
        </footer>
      )}
    </div>
  );
}
