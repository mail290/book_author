import React, { useState, useEffect, useRef } from 'react';
import { BookConfig, Book, GenerationStep, Chapter } from './types';
import * as gemini from './services/geminiService';
import NeonButton from './components/NeonButton';
import CyberInput from './components/CyberInput';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'library' | 'reading' | 'review'>('create');
  const [config, setConfig] = useState<BookConfig>({
    title: '',
    theme: '',
    bookType: 'Læring',
    series: '',
    genre: 'Kunnskap',
    style: 'Filosofisk & Dyp',
    length: 'medium',
    language: 'Norwegian'
  });
  const [contextData, setContextData] = useState('');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [pendingStructure, setPendingStructure] = useState<{ foreword: string, chapters: { title: string }[], afterword: string } | null>(null);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [library, setLibrary] = useState<Book[]>([]);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isRegeneratingArt, setIsRegeneratingArt] = useState(false);
  const [editConfig, setEditConfig] = useState<BookConfig | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedLibrary = localStorage.getItem('fb_book_archive');
    if (savedLibrary) {
      try {
        setLibrary(JSON.parse(savedLibrary));
      } catch (e) {
        console.error("Kunne ikke laste arkivet", e);
      }
    }
    const savedDraft = localStorage.getItem('fb_draft_config');
    const savedContext = localStorage.getItem('fb_draft_context');
    if (savedDraft) setConfig(JSON.parse(savedDraft));
    if (savedContext) setContextData(savedContext);
  }, []);

  useEffect(() => {
    localStorage.setItem('fb_book_archive', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    if (activeTab === 'create' && !isGenerating) {
      localStorage.setItem('fb_draft_config', JSON.stringify(config));
      localStorage.setItem('fb_draft_context', contextData);
      setIsSyncing(true);
      const timer = setTimeout(() => setIsSyncing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [config, contextData, activeTab]);

  useEffect(() => {
    if (isEditingDetails && editConfig && currentBook) {
      const updatedBook = { ...currentBook, config: editConfig };
      setCurrentBook(updatedBook);
      setLibrary(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
      setIsSyncing(true);
      const timer = setTimeout(() => setIsSyncing(false), 500);
      return () => clearTimeout(timer);
    }
  }, [editConfig]);

  const uniqueSeries = Array.from(new Set(library.map(b => b.config.series).filter(s => !!s)));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'series' && value) {
      const existingBook = library.find(b => b.config.series === value);
      if (existingBook) {
        setConfig(prev => ({
          ...prev,
          series: value,
          bookType: existingBook.config.bookType,
          genre: existingBook.config.genre,
          style: existingBook.config.style,
          language: existingBook.config.language
        }));
        return;
      }
    }
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (editConfig) {
      setEditConfig(prev => ({ ...prev!, [name]: value }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setContextData(prev => prev + "\n\n--- Kilde: " + file.name + " ---\n" + (event.target?.result as string));
      };
      reader.readAsText(file);
    }
  };

  const initiateStructure = async () => {
    if (!config.title) return alert("Vennligst oppgi en tittel.");
    setIsGenerating(true);
    setSteps([{ label: "Redaktøren arkitekterer manuskript-blueprint...", status: 'processing' }]);
    try {
      const structure = await gemini.generateBookStructure(config, contextData);
      setPendingStructure(structure);
      setIsGenerating(false);
      setActiveTab('review');
    } catch (error) {
      console.error(error);
      setIsGenerating(false);
      alert("Feil under generering av struktur.");
    }
  };

  const generateChapterWithRetry = async (cfg: BookConfig, title: string, summary: string, ctx: string, retries = 3): Promise<string> => {
    try {
      return await gemini.generateChapterContent(cfg, title, summary, ctx);
    } catch (error) {
      if (retries > 0) {
        const waitTime = (4 - retries) * 3000;
        await new Promise(res => setTimeout(res, waitTime));
        return generateChapterWithRetry(cfg, title, summary, ctx, retries - 1);
      }
      throw error;
    }
  };

  const regenerateArt = async () => {
    if (!currentBook) return;
    setIsRegeneratingArt(true);
    try {
      const frontCover = await gemini.generateBookImage(`Best-selling cover for "${currentBook.config.title}". Professional style.`);
      const backCover = await gemini.generateBookImage(`Back cover for "${currentBook.config.title}". Minimalist.`);
      const updatedBook = { ...currentBook, frontCoverUrl: frontCover, backCoverUrl: backCover };
      setCurrentBook(updatedBook);
      setLibrary(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    } catch (error) {
      console.error("Art regeneration failed", error);
    } finally {
      setIsRegeneratingArt(false);
    }
  };

  const confirmAndWriteChapters = async () => {
    if (!pendingStructure) return;
    setIsGenerating(true);
    const chapterCount = pendingStructure.chapters.length;
    setSteps([
      { label: "Skriver profesjonelt forord...", status: 'processing' },
      { label: `Produserer ${chapterCount} kapitler (Full lengde)...`, status: 'pending' },
      { label: "Designer bokomslag...", status: 'pending' },
      { label: "Ferdigstiller manuskript...", status: 'pending' }
    ]);
    try {
      const newBook: Book = {
        id: Date.now().toString(),
        config,
        foreword: pendingStructure.foreword,
        chapters: [],
        afterword: pendingStructure.afterword,
        internalImages: [],
        status: 'generating'
      };
      setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'completed' } : i === 1 ? { ...s, status: 'processing' } : s));
      let prevSummary = pendingStructure.foreword;
      const generatedChapters: Chapter[] = [];
      for (let i = 0; i < pendingStructure.chapters.length; i++) {
        setSteps(prev => prev.map((s, idx) => idx === 1 ? { ...s, label: `Skriver kapittel ${i + 1}/${chapterCount}: ${pendingStructure.chapters[i].title}` } : s));
        const content = await generateChapterWithRetry(config, pendingStructure.chapters[i].title, prevSummary, contextData);
        generatedChapters.push({ id: i + 1, title: pendingStructure.chapters[i].title, content });
        prevSummary = content.substring(content.length - 800);
      }
      setSteps(prev => prev.map((s, i) => i === 1 ? { ...s, label: `Fullført ${chapterCount} kapitler.`, status: 'completed' } : i === 2 ? { ...s, status: 'processing' } : s));
      let frontCover = "";
      let backCover = "";
      try {
        frontCover = await gemini.generateBookImage(`Professional book cover for "${config.title}".`);
        backCover = await gemini.generateBookImage(`Minimalist back cover for "${config.title}".`);
      } catch (imgError) {
        console.warn("Image generation failed", imgError);
      }
      setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, status: 'completed' } : i === 3 ? { ...s, status: 'processing' } : s));
      
      const internalImages: string[] = [];
      const imageCount = config.length === 'pocket' ? 4 : 2;
      const stepSize = Math.max(1, Math.floor(chapterCount / imageCount));
      for (let i = 0; i < chapterCount; i += stepSize) {
        if (internalImages.length >= imageCount) break;
        try {
          const visualPrompt = await gemini.generateInternalImagePrompt(generatedChapters[i].content);
          const img = await gemini.generateBookImage(visualPrompt, "16:9");
          internalImages.push(img);
        } catch (e) { console.warn(e); }
      }

      const finalBook: Book = { ...newBook, chapters: generatedChapters, frontCoverUrl: frontCover, backCoverUrl: backCover, internalImages: internalImages, status: 'completed' };
      setCurrentBook(finalBook);
      setSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
      localStorage.removeItem('fb_draft_config');
      localStorage.removeItem('fb_draft_context');
      setTimeout(() => { setIsGenerating(false); setActiveTab('reading'); setPendingStructure(null); }, 1000);
    } catch (error) {
      console.error(error);
      setIsGenerating(false);
      alert("Produksjonen ble avbrutt.");
    }
  };

  const handleSaveBook = () => {
    if (!currentBook) return;
    if (library.find(b => b.id === currentBook.id)) return alert("Allerede arkivert.");
    setLibrary(prev => [currentBook, ...prev]);
    alert("Manuskriptet er lagret i arkivet.");
  };

  const isCurrentBookSaved = currentBook ? library.some(b => b.id === currentBook.id) : false;

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden text-white font-sans bg-[#0A0E27]">
      <aside className="w-full lg:w-72 glass border-r border-[#00D9FF]/20 flex-shrink-0 flex flex-col p-6 z-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold neon-text-cyan leading-tight mb-2 uppercase tracking-tighter">
            Master Author<br/><span className="text-[#FF006E]">Architect</span>
          </h1>
          <p className="text-[10px] font-mono opacity-50 uppercase tracking-[0.2em]">World-class Publishing</p>
          <div className="h-px bg-gradient-to-r from-transparent via-[#00D9FF]/40 to-transparent mt-4"></div>
        </div>
        <nav className="space-y-3 flex-grow">
          <button onClick={() => { setActiveTab('create'); setIsEditingDetails(false); }} className={`w-full text-left px-4 py-3 font-mono text-sm tracking-widest flex items-center transition-all border-l-2 ${activeTab === 'create' ? 'text-[#00D9FF] border-[#00D9FF] bg-[#00D9FF]/10' : 'text-gray-500 border-transparent hover:text-white'}`}>◈ NYTT MANUSKRIPT</button>
          <button onClick={() => { setActiveTab('library'); setIsEditingDetails(false); }} className={`w-full text-left px-4 py-3 font-mono text-sm tracking-widest flex items-center transition-all border-l-2 ${activeTab === 'library' ? 'text-[#FF006E] border-[#FF006E] bg-[#FF006E]/10' : 'text-gray-500 border-transparent hover:text-white'}`}>▣ NEVRALT ARKIV</button>
          {currentBook && <button onClick={() => setActiveTab('reading')} className={`w-full text-left px-4 py-3 font-mono text-sm tracking-widest flex items-center transition-all border-l-2 ${activeTab === 'reading' ? 'text-[#FFBE0B] border-[#FFBE0B] bg-[#FFBE0B]/10' : 'text-gray-500 border-transparent hover:text-white'}`}>📖 AKTIV LESER</button>}
        </nav>
        <div className="mt-auto pt-6 border-t border-[#00D9FF]/10">
          <div className="text-[10px] font-mono text-[#00D9FF]/60 mb-2 uppercase tracking-tighter">System: Online</div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-[#00D9FF] w-full shadow-[0_0_10px_#00D9FF]"></div></div>
        </div>
      </aside>

      <main className="flex-grow overflow-y-auto relative p-4 md:p-10 lg:p-16">
        {activeTab === 'create' && !isGenerating && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="mb-10 text-center relative">
              <h2 className="text-4xl font-bold neon-text-cyan mb-4 uppercase tracking-tighter">Initialiser Verket</h2>
              <p className="text-gray-400 font-mono text-sm leading-relaxed max-w-xl mx-auto italic">Profesjonell AI-drevet bokskaping for freddybremseth.com.</p>
              <div className={`absolute top-0 right-0 font-mono text-[8px] flex items-center gap-2 transition-opacity duration-300 ${isSyncing ? 'opacity-100 text-[#FF006E]' : 'opacity-40 text-[#00D9FF]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${isSyncing ? 'animate-pulse' : ''}`}></span> EDITORIAL SYNC {isSyncing ? 'ACTIVE' : 'IDLE'}
              </div>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 glass p-8 rounded-lg border-[#00D9FF]/20 shadow-2xl">
              <CyberInput name="title" label="Verkets Tittel" placeholder="Tittel på boken..." value={config.title} onChange={handleInputChange} />
              <div className="relative"><CyberInput name="series" label="Serie (Valgfri)" placeholder="F.eks: Nordisk Noir" value={config.series} onChange={handleInputChange} list="series-list" /><datalist id="series-list">{uniqueSeries.map(s => <option key={s} value={s} />)}</datalist></div>
              <CyberInput name="bookType" label="Kategori" type="select" options={[{ value: 'Thriller', label: 'Thriller' }, { value: 'Roman', label: 'Roman' }, { value: 'Krim', label: 'Krim' }, { value: 'Fagbok', label: 'Fagbok' }]} value={config.bookType} onChange={handleInputChange} />
              <CyberInput name="length" label="Format & Sidetall" type="select" options={[{ value: 'short', label: 'Kort (E-bok)' }, { value: 'medium', label: 'Standard (150-200 s)' }, { value: 'long', label: 'Lang (Fullverdig)' }, { value: 'pocket', label: 'Pocket-thriller (250-300 s)' }]} value={config.length} onChange={handleInputChange} />
              <CyberInput name="genre" label="Genre" type="select" options={[{ value: 'Krim/Thriller', label: 'Krim/Thriller' }, { value: 'Teknologi', label: 'Teknologi' }, { value: 'Business', label: 'Business' }, { value: 'Biografi', label: 'Biografi' }]} value={config.genre} onChange={handleInputChange} />
              <CyberInput name="style" label="Forfatterstemme" type="select" options={[{ value: 'Litterær & Dyp', label: 'Litterær & Dyp' }, { value: 'Effektiv/Klar', label: 'Effektiv & Klar' }, { value: 'Dramatisk', label: 'Dramatisk' }]} value={config.style} onChange={handleInputChange} />
              <div className="md:col-span-2"><CyberInput name="theme" label="Plott & Handling" type="textarea" placeholder="Beskriv hovedplottet eller temaet i verket..." value={config.theme} onChange={handleInputChange} /></div>
              <div className="md:col-span-2 flex flex-col md:flex-row gap-4 pt-4 border-t border-[#00D9FF]/10"><input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".txt,.md,.pdf" /><NeonButton variant="magenta" className="flex-1" onClick={() => fileInputRef.current?.click()}>LAST OPP KILDER</NeonButton><NeonButton variant="cyan" className="flex-1" onClick={initiateStructure}>GENERER BLUEPRINT</NeonButton></div>
            </div>
          </div>
        )}

        {activeTab === 'review' && pendingStructure && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom duration-700">
            <header className="mb-6"><h2 className="text-3xl font-bold neon-text-cyan mb-2 uppercase">Redaksjonell Blueprint</h2><p className="text-gray-400 font-mono text-xs tracking-widest">Gjennomgå strukturen før fullskala produksjon</p></header>
            <div className="glass p-10 rounded-lg border-[#FFBE0B]/20 shadow-2xl space-y-8">
              <div className="border-b border-white/10 pb-6"><h4 className="text-[#FF006E] font-mono text-xs uppercase mb-3 tracking-widest">Forord</h4><p className="text-sm text-gray-300 italic leading-relaxed">"{pendingStructure.foreword.substring(0, 500)}..."</p></div>
              <div><h4 className="text-[#00D9FF] font-mono text-xs uppercase mb-4 tracking-widest">Kapitler ({pendingStructure.chapters.length})</h4><div className="space-y-4">{pendingStructure.chapters.map((ch, idx) => (<div key={idx} className="flex gap-4 items-center group"><div className="w-8 font-mono text-[#FFBE0B] text-sm font-bold">{idx + 1}</div><div className="flex-grow bg-[#0A0E27]/50 border-b border-[#00D9FF]/20 text-white py-2 font-bold">{ch.title}</div></div>))}</div></div>
              <div className="flex flex-col md:flex-row gap-4 pt-10 border-t border-white/10"><NeonButton variant="magenta" className="flex-1" onClick={() => setActiveTab('create')}>REVIDER</NeonButton><NeonButton variant="cyan" className="flex-1" onClick={confirmAndWriteChapters}>BEKREFT & SKRIV</NeonButton></div>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="fixed inset-0 z-50 bg-[#0A0E27]/95 flex items-center justify-center p-6 backdrop-blur-xl">
            <div className="max-w-xl w-full text-center">
              <div className="relative mb-16"><div className="w-24 h-24 border-4 border-t-[#00D9FF] border-b-[#FF006E] border-l-transparent border-r-transparent rounded-full animate-spin mx-auto shadow-[0_0_30px_rgba(0,217,255,0.3)]"></div><div className="absolute inset-0 flex items-center justify-center font-mono text-[#00D9FF] animate-pulse text-[10px] tracking-widest">WRITING</div></div>
              <h2 className="text-3xl font-bold neon-text-cyan mb-10 uppercase tracking-[0.4em]">Produserer Manuskript</h2>
              <div className="space-y-4 text-left glass p-8 border-[#00D9FF]/30 rounded-lg">{steps.map((step, idx) => (<div key={idx} className="flex items-center gap-4"><div className={`w-3 h-3 rounded-full transition-all duration-500 ${step.status === 'completed' ? 'bg-[#FFBE0B] shadow-[0_0_10px_#FFBE0B]' : step.status === 'processing' ? 'bg-[#00D9FF] animate-pulse shadow-[0_0_15_#00D9FF]' : 'bg-gray-800'}`}></div><span className={`font-mono text-xs tracking-tight ${step.status === 'completed' ? 'text-white' : step.status === 'processing' ? 'text-[#00D9FF]' : 'text-gray-600'}`}>{step.label}</span></div>))}</div>
            </div>
          </div>
        )}

        {activeTab === 'reading' && currentBook && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-1000 pb-40">
            <div className="mb-32 flex flex-col md:flex-row items-center gap-12">
              <div className="w-full md:w-1/2 aspect-[2/3] relative overflow-hidden rounded-md shadow-[0_30px_60px_rgba(0,0,0,0.9)] border border-white/10 group bg-[#151b3d]">{currentBook.frontCoverUrl ? <img src={currentBook.frontCoverUrl} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" /> : <div className="w-full h-full flex items-center justify-center text-gray-500">📖</div>}<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div><div className="absolute bottom-12 left-0 right-0 text-center px-6"><div className="text-[#FF006E] font-mono text-[9px] uppercase tracking-[0.4em] mb-4">Master Author Architect</div><h3 className="text-3xl font-bold uppercase tracking-tighter leading-none mb-2">{currentBook.config.title}</h3><div className="h-0.5 w-12 bg-[#00D9FF] mx-auto"></div></div></div>
              <div className="w-full md:w-1/2">
                <div className="uppercase font-mono text-[#00D9FF] text-[10px] mb-3 tracking-[0.4em] animate-pulse">Litterær Status: Fullført</div>
                <h2 className="text-5xl font-bold mb-8 neon-text-cyan leading-none uppercase tracking-tighter">{currentBook.config.title}</h2>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-[11px] font-mono text-gray-400 mb-10 border-l-2 border-[#FF006E] pl-6">
                  <div>SERIE: <span className="text-white">{currentBook.config.series || 'Uavhengig'}</span></div>
                  <div>FORMAT: <span className="text-white">{currentBook.config.length === 'pocket' ? 'Pocket (250-300 s)' : 'Standard'}</span></div>
                  <div>GENRE: <span className="text-white">{currentBook.config.genre}</span></div>
                  <div>MANUS_ID: <span className="text-white">#{currentBook.id.slice(-6)}</span></div>
                </div>
                <div className="flex flex-wrap gap-4"><NeonButton variant="cyan" onClick={handleSaveBook} disabled={isCurrentBookSaved}>{isCurrentBookSaved ? "ARKIVERT" : "ARKIVER VERK"}</NeonButton><NeonButton variant="magenta" onClick={() => setActiveTab('library')}>LUKK LESER</NeonButton></div>
              </div>
            </div>
            <div className="space-y-32">
              <section className="glass p-12 md:p-20 border-t-8 border-[#00D9FF] rounded-sm shadow-2xl">
                <div className="mb-12 flex justify-between items-center"><h3 className="text-2xl font-bold neon-text-cyan uppercase italic font-mono tracking-widest">Forord</h3><div className="text-[10px] font-mono text-gray-600 uppercase">Redaksjonell_Intro</div></div>
                <div className="font-serif text-xl leading-[1.8] text-gray-300 first-letter:text-6xl first-letter:font-bold first-letter:text-[#FF006E] first-letter:mr-3 first-letter:float-left whitespace-pre-wrap">{currentBook.foreword}</div>
              </section>
              {currentBook.chapters.map((chapter, index) => (
                <React.Fragment key={chapter.id}>
                  <section className="border-b border-white/5 pb-24 last:border-0 last:pb-0">
                    <div className="mb-16"><div className="flex items-center gap-4 mb-4"><span className="w-10 h-px bg-[#FF006E]"></span><span className="font-mono text-[#FF006E] text-xs uppercase tracking-[0.4em]">Kapittel {chapter.id}</span></div><h3 className="text-5xl font-bold neon-text-cyan leading-tight uppercase tracking-tighter">{chapter.title}</h3></div>
                    <div className="font-serif text-2xl leading-[1.8] text-gray-200 space-y-8 whitespace-pre-wrap">{chapter.content}</div>
                  </section>
                  {currentBook.internalImages && currentBook.internalImages[index] && (<div className="my-32 group"><div className="w-full aspect-video overflow-hidden rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#00D9FF]/20 relative"><img src={currentBook.internalImages[index]} className="w-full h-full object-cover transition-transform duration-[3s] group-hover:scale-110" /><div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60"></div><div className="absolute bottom-6 left-6 font-mono text-[10px] text-[#00D9FF] tracking-widest uppercase opacity-60">Illustrasjon: {chapter.title}</div></div></div>)}
                </React.Fragment>
              ))}
              <section className="flex flex-col md:flex-row-reverse items-center gap-16 mt-40 border-t border-white/5 pt-32">
                <div className="w-full md:w-1/2 lg:w-1/3 aspect-[2/3] relative group overflow-hidden rounded-md shadow-[0_30px_60px_rgba(0,0,0,0.9)] border border-white/10 bg-[#151b3d]">{currentBook.backCoverUrl && <img src={currentBook.backCoverUrl} className="w-full h-full object-cover" />}<div className="absolute bottom-8 left-0 right-0 text-center px-4"><div className="text-[8px] font-mono text-white/40 uppercase tracking-[0.6em]">FreddyBremseth.com</div></div></div>
                <div className="w-full md:w-2/3 glass p-12 font-mono text-sm border-[#FFBE0B]/20"><h4 className="text-[#FFBE0B] mb-6 text-xl uppercase tracking-widest italic">Etterord</h4><p className="text-gray-400 italic leading-loose whitespace-pre-wrap text-lg">{currentBook.afterword}</p></div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="max-w-6xl mx-auto animate-in fade-in duration-700">
            <header className="mb-16 flex flex-col md:flex-row justify-between items-end gap-6"><div><h2 className="text-4xl font-bold neon-text-magenta mb-2 uppercase tracking-tighter">Nevralt Arkiv</h2><p className="text-gray-400 font-mono text-xs uppercase tracking-widest">Permanent lagring for dine litterære verk</p></div><div className="text-right glass px-6 py-4 border-[#FF006E]/30 rounded-md"><div className="text-[10px] font-mono text-[#FF006E] mb-1 uppercase tracking-widest">Totale Manuskripter</div><div className="text-4xl font-bold font-mono">{library.length}</div></div></header>
            {library.length === 0 ? <div className="flex flex-col items-center justify-center py-40 glass border-2 border-dashed border-[#00D9FF]/20 rounded-xl"><div className="text-6xl mb-6 opacity-30">📚</div><NeonButton variant="cyan" onClick={() => setActiveTab('create')}>START PRODUKSJON</NeonButton></div> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-12">{library.map((book) => (<div key={book.id} className="group relative flex flex-col"><div className="aspect-[2/3] overflow-hidden rounded shadow-2xl border border-white/5 cursor-pointer transition-all duration-500 group-hover:scale-105 group-hover:border-[#00D9FF] bg-[#151b3d]" onClick={() => { setCurrentBook(book); setActiveTab('reading'); }}>{book.frontCoverUrl && <img src={book.frontCoverUrl} className="w-full h-full object-cover" />}<div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors pointer-events-none"></div></div><div className="mt-6"><div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg leading-tight truncate group-hover:text-[#00D9FF] transition-colors uppercase">{book.config.title}</h3><button className="text-[9px] text-gray-600 hover:text-[#FF006E] font-mono uppercase ml-2 transition-colors" onClick={(e) => { e.stopPropagation(); if(confirm("Slette manuskript?")) { setLibrary(prev => prev.filter(b => b.id !== book.id)); } }}>Slett</button></div><div className="text-[10px] font-mono text-gray-500 uppercase flex justify-between"><span>{book.config.series || 'Uavhengig'}</span><span className="text-[#FFBE0B]">{book.chapters.length} Kapitler</span></div></div></div>))}</div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 right-0 p-4 pointer-events-none z-40"><div className="text-[8px] font-mono text-[#00D9FF] text-right opacity-30 uppercase tracking-[0.4em]">FB_AUTHOR_ARCHITECT_v5.0.0<br/>(C) 2025 FREDDYBREMSETH.COM MASTER AUTHOR</div></footer>
    </div>
  );
};

export default App;