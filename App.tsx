import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, Wand2, Download, ChevronRight, Image as ImageIcon, CheckCircle2, 
  Sparkles, Loader2, Sliders, ThumbsUp, ThumbsDown, BrainCircuit, X, 
  Smartphone, Aperture, Play, LayoutGrid, ArrowLeft, Plus, ZoomIn, ZoomOut, Cpu, Key,
  Brush, Eraser, Trash2, Undo2, Lock, FileJson, Copy, Check, ScanEye, Code2, Palette,
  Zap, RefreshCw, ImagePlus, Blend, MoveHorizontal, SplitSquareHorizontal
} from 'lucide-react';

// --- HELPERS ---

const isAuthError = (err: any) => {
  const str = (err.toString() + (typeof err === 'object' ? JSON.stringify(err) : '')).toLowerCase();
  return str.includes("403") || str.includes("permission_denied") || str.includes("permission denied") || str.includes("not found");
};

// --- CONSTANTS ---

// Mapping Nano Banana models to actual Gemini Model IDs
const MODELS = [
  { 
    id: 'nano-banana-1', 
    apiModel: 'gemini-2.5-flash-image', 
    name: 'Nano Banana 1', 
    label: 'Standard', 
    description: 'Fast, efficient, creative drafts.',
    disabled: false
  },
  { 
    id: 'nano-banana-2', 
    apiModel: 'gemini-3-pro-image-preview', 
    name: 'Nano Banana 2', 
    label: 'Pro', 
    description: 'Ultra-realistic details & reasoning.',
    disabled: true 
  }
];

interface NodeData {
  image: string | null;
  prompt: string;
  status: 'idle' | 'loading' | 'complete';
  result: string | null;
  model: string; // 'nano-banana-1' | 'nano-banana-2'
}

interface Node {
  id: string;
  type: 'source' | 'generator';
  x: number;
  y: number;
  parentId?: string;
  data: NodeData;
}

// --- SHARED COMPONENTS ---

const AppFooter = ({ className = "" }: { className?: string }) => (
  <div className={`text-center py-4 select-none ${className}`}>
    <p className="text-[10px] font-bold tracking-[0.2em] text-[#424245] uppercase hover:text-[#86868b] transition-colors cursor-default">
      Engineered by Samuel Marques Stello <span className="mx-1.5 text-[#0071e3]">•</span> Powered by Gemini <span className="mx-1.5 text-[#0071e3]">•</span> 2025
    </p>
  </div>
);

// --- COMPARE SLIDER COMPONENT ---

const CompareSlider = ({ original, generated }: { original: string; generated: string }) => {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percent = (x / rect.width) * 100;
      setPosition(percent);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
      isDragging.current = true;
      updatePosition(e.clientX);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging.current) updatePosition(e.clientX);
  };

  const handleMouseUp = () => {
      isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      updatePosition(e.touches[0].clientX);
  };

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full select-none overflow-hidden touch-none cursor-col-resize group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
    >
        {/* Background: Generated (After) */}
        <img src={generated} alt="Generated" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" />
        
        {/* Foreground: Original (Before) - Clipped */}
        <div 
            className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
            <img src={original} alt="Original" className="absolute inset-0 w-full h-full object-contain" />
        </div>

        {/* Divider Line */}
        <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white cursor-col-resize z-10 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
            style={{ left: `${position}%` }}
        >
             {/* Handle */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white/20 backdrop-blur border border-white/50 rounded-full flex items-center justify-center shadow-lg group-hover:bg-white/40 transition-colors">
                 <MoveHorizontal size={14} className="text-white" />
             </div>
        </div>
        
        {/* Labels */}
        <div className="absolute top-4 left-4 bg-black/60 text-white/90 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-white/10 pointer-events-none transition-opacity duration-300" style={{ opacity: position > 10 ? 1 : 0 }}>Original</div>
        <div className="absolute top-4 right-4 bg-black/60 text-white/90 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-white/10 pointer-events-none transition-opacity duration-300" style={{ opacity: position < 90 ? 1 : 0 }}>Result</div>
    </div>
  );
};

// --- ADVANCED CANVAS COMPONENTS ---

const ConnectionLine: React.FC<{ start: { x: number; y: number }; end: { x: number; y: number } }> = ({ start, end }) => {
  const path = `M ${start.x} ${start.y} C ${start.x + 150} ${start.y}, ${end.x - 150} ${end.y}, ${end.x} ${end.y}`;
  return (
    <path d={path} stroke="#424245" strokeWidth="2" fill="none" className="animate-in fade-in duration-500" />
  );
};

const AdvancedCanvas = ({ originalImage, onBack, onAuthError }: { originalImage: string | null; onBack: () => void; onAuthError: () => void }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<Node | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (nodes.length === 0) {
        setNodes([{ 
            id: 'root', 
            type: 'source', 
            x: 100, 
            y: 200, 
            data: { image: originalImage, prompt: '', status: 'idle', result: null, model: 'nano-banana-1' } 
        }]);
    }
  }, [originalImage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        const zoomSensitivity = 0.001;
        const newScale = Math.min(Math.max(0.1, scale - e.deltaY * zoomSensitivity), 3);
        setScale(newScale);
    } else {
        setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
    if (draggingNode) {
        const newNodes = nodes.map(n => {
            if (n.id === draggingNode.id) {
                return { ...n, x: n.x + e.movementX / scale, y: n.y + e.movementY / scale };
            }
            return n;
        });
        setNodes(newNodes);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingNode(null);
  };

  const addNode = (parentId: string) => {
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    
    const newNode: Node = {
        id: newNodeId,
        type: 'generator',
        x: parent.x + 450,
        y: parent.y,
        parentId: parentId,
        data: { 
            image: null,
            prompt: '', 
            status: 'idle', 
            result: null,
            model: 'nano-banana-1' // Default to 1 while 2 is disabled
        }
    };
    setNodes([...nodes, newNode]);
  };

  const updateNodeData = (id: string, newData: Partial<NodeData>) => {
      setNodes(nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n));
  };

  const downloadNodeImage = (dataUrl: string, nodeId: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `changer-node-${nodeId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const runGenerator = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.parentId) return;

    const parent = nodes.find(n => n.id === node.parentId);
    if (!parent) return;
    
    const sourceImage = parent.data.result || parent.data.image;
    if (!sourceImage) return;

    updateNodeData(nodeId, { status: 'loading' });

    try {
        // Instantiate locally to use fresh API key
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const base64Data = sourceImage.split(',')[1];
        const mimeType = sourceImage.split(';')[0].split(':')[1];
        const prompt = node.data.prompt; 
        
        const selectedModelConfig = MODELS.find(m => m.id === node.data.model) || MODELS[0];
        const modelName = selectedModelConfig.apiModel;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { 
                        text: `Transform this image based on the following instruction: "${prompt}". Maintain the composition but change style/content significantly as requested. High quality photorealistic output.` 
                    },
                    { 
                        inlineData: { mimeType: mimeType, data: base64Data } 
                    }
                ]
            }
        });

        let generatedBase64 = null;
        
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    generatedBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (generatedBase64) {
            updateNodeData(nodeId, { status: 'complete', result: `data:image/png;base64,${generatedBase64}` });
        } else {
            updateNodeData(nodeId, { status: 'idle' });
        }

    } catch (e: any) {
        console.error("Generator Error", e);
        if (isAuthError(e)) {
            onAuthError();
        }
        updateNodeData(nodeId, { status: 'idle' });
    }
  };

  return (
    <div className="relative w-full flex-1 bg-[#0a0a0a] overflow-hidden flex flex-col h-screen">
        
        {/* Toolbar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1e]/90 backdrop-blur border border-[#424245] px-4 py-2 rounded-full flex items-center gap-4 shadow-xl select-none">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#86868b] hover:text-white transition-colors">
                <ArrowLeft size={14} /> Back
            </button>
            <div className="w-px h-4 bg-[#424245]"></div>
            <span className="text-xs font-medium text-white flex items-center gap-2"><BrainCircuit size={14} className="text-[#0071e3]" /> Neural Flow</span>
            <div className="w-px h-4 bg-[#424245]"></div>
            <div className="flex items-center gap-2">
                <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-1 hover:bg-[#2c2c2e] rounded text-[#86868b] hover:text-white"><ZoomOut size={14}/></button>
                <span className="text-xs text-[#86868b] w-10 text-center">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1 hover:bg-[#2c2c2e] rounded text-[#86868b] hover:text-white"><ZoomIn size={14}/></button>
            </div>
        </div>

        <div 
            ref={containerRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
                backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
                backgroundSize: `${20 * scale}px ${20 * scale}px`,
                backgroundPosition: `${offset.x}px ${offset.y}px`
            }}
        >
            <div 
                className="absolute origin-top-left transition-transform duration-75 ease-linear"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            >
                <svg className="absolute top-0 left-0 w-[10000px] h-[10000px] pointer-events-none overflow-visible" style={{ transform: 'translate(-5000px, -5000px)' }}> 
                    {nodes.map(node => {
                        if (!node.parentId) return null;
                        const parent = nodes.find(n => n.id === node.parentId);
                        if (!parent) return null;
                        return <ConnectionLine key={node.id} start={{x: parent.x + 5000 + 300, y: parent.y + 5000 + 200}} end={{x: node.x + 5000, y: node.y + 5000 + 200}} />;
                    })}
                </svg>

                {nodes.map(node => (
                    <div 
                        key={node.id}
                        className="absolute w-[300px] bg-[#1c1c1e] border border-[#424245] rounded-2xl shadow-2xl flex flex-col overflow-hidden group animate-in zoom-in duration-300 select-none"
                        style={{ left: node.x, top: node.y }}
                    >
                        <div 
                            className="h-10 bg-[#2c2c2e] border-b border-[#424245] flex items-center justify-between px-4 cursor-move"
                            onMouseDown={(e) => { e.stopPropagation(); setDraggingNode(node); }}
                        >
                            <span className="text-[11px] uppercase tracking-widest text-[#86868b] font-bold flex items-center gap-2">
                                {node.type === 'source' ? <ImageIcon size={12} className="text-[#0071e3]"/> : <Wand2 size={12} className="text-purple-400"/>}
                                {node.type === 'source' ? 'SOURCE' : 'GENERATOR'}
                            </span>
                            {node.type === 'generator' && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${node.data.model === 'nano-banana-2' ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-[#424245] border-transparent text-[#86868b]'}`}>
                                    {node.data.model === 'nano-banana-2' ? 'NB-2' : 'NB-1'}
                                </span>
                            )}
                        </div>

                        <div className="p-3 bg-black/50">
                            <div className="relative aspect-[4/3] bg-[#0a0a0a] rounded-lg overflow-hidden mb-3 border border-[#424245]/50 group/image">
                                {(node.data.image || node.data.result) ? (
                                    <>
                                        <img 
                                            src={node.data.image || node.data.result || ''} 
                                            alt="Node Content" 
                                            className="w-full h-full object-contain"
                                            draggable={false}
                                        />
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (node.data.image || node.data.result) {
                                                    downloadNodeImage(node.data.image || node.data.result || '', node.id);
                                                }
                                            }}
                                            className="absolute top-2 right-2 bg-black/60 hover:bg-[#0071e3] text-white p-1.5 rounded-full opacity-0 group-hover/image:opacity-100 transition-all z-10 backdrop-blur-sm border border-white/10"
                                            title="Save Image"
                                        >
                                            <Download size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-[#424245] gap-2">
                                        {node.data.status === 'loading' ? (
                                            <>
                                                <Loader2 className="animate-spin text-[#0071e3]" size={24}/>
                                                <span className="text-xs">Processing...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ImageIcon size={24} />
                                                <span className="text-xs">No Image</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {node.type === 'generator' && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 bg-[#2c2c2e] p-1 rounded-lg">
                                        {MODELS.map(m => (
                                            <button
                                                key={m.id}
                                                disabled={m.disabled}
                                                onClick={() => updateNodeData(node.id, { model: m.id })}
                                                className={`flex-1 text-[10px] py-1 rounded transition-all flex items-center justify-center gap-1 ${node.data.model === m.id ? 'bg-[#424245] text-white shadow' : 'text-[#86868b] hover:text-white'} ${m.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                title={m.disabled ? "Currently unavailable" : m.description}
                                            >
                                                {m.disabled && <Lock size={8} />}
                                                {m.name}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            placeholder="Describe change..." 
                                            className="w-full bg-[#2c2c2e] border border-transparent focus:border-[#0071e3] rounded-lg pl-3 pr-8 py-2 text-xs text-white outline-none transition-all placeholder-[#6e6e73]"
                                            value={node.data.prompt}
                                            onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
                                            onKeyDown={(e) => e.key === 'Enter' && runGenerator(node.id)}
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <Sparkles size={10} className="text-[#86868b]" />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => runGenerator(node.id)}
                                        disabled={node.data.status === 'loading' || !node.data.prompt}
                                        className="w-full bg-[#0071e3] hover:bg-[#0077ed] disabled:bg-[#2c2c2e] disabled:text-[#86868b] text-white text-xs font-medium py-2 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                                    >
                                        {node.data.status === 'loading' ? 'Generating...' : 'Run Node'}
                                        {node.data.status !== 'loading' && <Play size={10} fill="currentColor"/>}
                                    </button>
                                </div>
                            )}
                        </div>

                        {(node.data.image || node.data.result) && (
                            <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 translate-x-0 group-hover:translate-x-1 transition-transform">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); addNode(node.id); }}
                                    className="w-6 h-6 bg-[#f5f5f7] hover:bg-white rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:scale-110 transition-all border-2 border-[#0a0a0a]"
                                    title="Create new node from this"
                                >
                                    <Plus size={12} strokeWidth={3} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
};

// --- BRUSH EDITOR COMPONENT ---

const BrushEditor = ({ 
    image, 
    onBack, 
    onGenerate, 
    loading,
    error
}: { 
    image: string; 
    onBack: () => void; 
    onGenerate: (mask: string, prompt: string) => void;
    loading: boolean;
    error: string;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(40);
    const [isErasing, setIsErasing] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const [canvasHistory, setCanvasHistory] = useState<ImageData[]>([]);

    useEffect(() => {
        const img = new Image();
        img.src = image;
        img.onload = () => {
            setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        };
    }, [image]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && imageDimensions.width > 0) {
            canvas.width = imageDimensions.width;
            canvas.height = imageDimensions.height;
            // Clear or init logic if needed
        }
    }, [imageDimensions]);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) {
            // Save state for undo
            setCanvasHistory(prev => [...prev.slice(-4), ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
            
            const { x, y } = getCoordinates(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = brushSize;
            if (isErasing) {
                ctx.globalCompositeOperation = 'destination-out';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                // Increased opacity to 0.8 to help user create a more solid mask easily
                // while still allowing them to see what they are painting over.
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; 
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            }
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            e.preventDefault(); // Prevent scrolling on touch
            const { x, y } = getCoordinates(e);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.closePath();
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            setCanvasHistory(prev => [...prev.slice(-4), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const handleUndo = () => {
        if (canvasHistory.length === 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            const lastState = canvasHistory[canvasHistory.length - 1];
            ctx.putImageData(lastState, 0, 0);
            setCanvasHistory(prev => prev.slice(0, -1));
        }
    };

    const getMaskBase64 = () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        // Create a temporary canvas to generate the mask
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        if (!tCtx) return null;

        // 1. Draw the user's strokes (transparent background by default)
        tCtx.drawImage(canvas, 0, 0);

        // 2. Composite Mode: source-in
        // Draws the fill rect (White) ONLY where the existing content (strokes) is opaque.
        // This effectively recolors the strokes to White while preserving transparency.
        // The Result is: White pixels (mask) on Transparent background (unmasked).
        tCtx.globalCompositeOperation = 'source-in';
        tCtx.fillStyle = '#FFFFFF';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        return tempCanvas.toDataURL('image/png');
    };

    const handleGenerateClick = () => {
        const mask = getMaskBase64();
        if (mask && prompt) {
            onGenerate(mask, prompt);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-screen bg-[#0a0a0a] relative">
            {/* Header */}
            <div className="flex-none bg-[#1c1c1e] border-b border-[#424245] h-14 px-4 flex items-center justify-between z-20">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#86868b] hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Exit Brush
                </button>
                <div className="flex items-center gap-4">
                    <button onClick={handleUndo} disabled={canvasHistory.length === 0} className="p-2 text-[#86868b] hover:text-white disabled:opacity-30">
                        <Undo2 size={18} />
                    </button>
                    <button onClick={clearCanvas} className="p-2 text-[#86868b] hover:text-red-400 disabled:opacity-30">
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div ref={containerRef} className="flex-1 overflow-hidden relative flex items-center justify-center p-8 bg-black/50" 
                 style={{backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                {image && (
                    <div className="relative shadow-2xl border border-[#424245]/50">
                        <img src={image} alt="Target" className="max-w-full max-h-[70vh] object-contain pointer-events-none select-none" />
                        <canvas 
                            ref={canvasRef}
                            className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                    </div>
                )}
            </div>

            {/* Floating Toolbar */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#1c1c1e]/90 backdrop-blur border border-[#424245] p-2 rounded-2xl flex items-center gap-4 shadow-xl z-30">
                <div className="flex items-center gap-2 px-2">
                    <Brush size={16} className={!isErasing ? "text-[#0071e3]" : "text-[#86868b]"} />
                    <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={brushSize} 
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-24 h-1 bg-[#424245] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                </div>
                <div className="w-px h-6 bg-[#424245]"></div>
                <button 
                    onClick={() => setIsErasing(!isErasing)} 
                    className={`p-2 rounded-lg transition-colors ${isErasing ? 'bg-[#0071e3] text-white' : 'hover:bg-[#2c2c2e] text-[#86868b]'}`}
                    title="Eraser"
                >
                    <Eraser size={18} />
                </button>
            </div>

            {/* Bottom Bar */}
            <div className="flex-none bg-[#1c1c1e] border-t border-[#424245] p-6 z-30">
                <div className="max-w-2xl mx-auto flex gap-4">
                    <input 
                        type="text" 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="What should happen in the masked area?" 
                        className="flex-1 bg-[#2c2c2e] border border-transparent focus:border-[#0071e3] rounded-xl px-4 text-white outline-none transition-all placeholder-[#6e6e73]"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerateClick()}
                    />
                    <button 
                        onClick={handleGenerateClick}
                        disabled={loading || !prompt}
                        className="bg-[#0071e3] hover:bg-[#0077ed] disabled:bg-[#3a3a3c] disabled:text-[#86868b] text-white px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 min-w-[120px] justify-center"
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                        <span>Generate</span>
                    </button>
                </div>
                {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}
            </div>
        </div>
    );
};

// --- FILTER STUDIO COMPONENT ---

const FilterStudio = ({ 
    image, 
    onBack, 
    onApply, 
    loading,
    error
}: { 
    image: string; 
    onBack: () => void; 
    onApply: (prompt: string) => void;
    loading: boolean;
    error: string;
}) => {
    const [filterPrompt, setFilterPrompt] = useState("");
    const [enhancing, setEnhancing] = useState(false);
    
    // Style Match State
    const [refImage, setRefImage] = useState<string | null>(null);
    const [analyzingRef, setAnalyzingRef] = useState(false);
    const refInputRef = useRef<HTMLInputElement>(null);

    const presets = [
        { name: "Vintage", prompt: "1970s vintage film photography style, warm tones, film grain, nostalgic feel." },
        { name: "Cyberpunk", prompt: "Neon cyberpunk aesthetic, cyan and magenta lighting, high contrast, futuristic city vibes." },
        { name: "B&W Noir", prompt: "Black and white film noir style, dramatic lighting, high contrast, cinematic shadows." },
        { name: "Watercolor", prompt: "Soft watercolor painting style, artistic strokes, pastel colors, paper texture." },
        { name: "Claymation", prompt: "Claymation stop-motion style, plastic texture, soft lighting, depth of field." },
        { name: "Matrix", prompt: "Matrix code rain aesthetic, green tint, digital glitch effects, dark background." },
    ];

    const handleApply = () => {
        if (filterPrompt) {
            onApply(filterPrompt);
        }
    };

    const handleEnhance = async () => {
        if (!filterPrompt.trim()) return;
        setEnhancing(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Refine this art style description into a high-quality, descriptive prompt for an AI image generator. Focus on visual aesthetics, medium, and technique. Input: "${filterPrompt}"`,
            });
            if (response.text) {
                setFilterPrompt(response.text.trim());
            }
        } catch (e) {
            console.error("Enhance failed", e);
        } finally {
            setEnhancing(false);
        }
    };

    const handleRefUpload = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                const base64 = e.target.result as string;
                setRefImage(base64);
                analyzeRefStyle(base64);
            }
        };
        reader.readAsDataURL(file);
    };

    const analyzeRefStyle = async (base64: string) => {
        setAnalyzingRef(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const imgData = base64.split(',')[1];
            const imgMime = base64.split(';')[0].split(':')[1];
            
            // Using gemini-2.5-flash as it is multimodal
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { text: "Analyze the visual style, color grading, lighting, filters, and texture of this image. Describe ONLY the aesthetic style in a comma-separated list of keywords (e.g., 'grainy film, green tint, high contrast'). Do not describe the subject." },
                        { inlineData: { mimeType: imgMime, data: imgData } }
                    ]
                }
            });
            
            if (response.text) {
                setFilterPrompt(response.text.trim());
            }
        } catch (e) {
            console.error("Style analysis failed", e);
        } finally {
            setAnalyzingRef(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-screen bg-[#0a0a0a] relative">
            {/* Header */}
            <div className="flex-none bg-[#1c1c1e] border-b border-[#424245] h-14 px-4 flex items-center justify-between z-20">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#86868b] hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Back to Studio
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white flex items-center gap-2"><Palette size={16} className="text-[#0071e3]" /> Filter Studio</span>
                </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Preview Area */}
                <div className="flex-1 lg:flex-[0.7] bg-black p-8 flex items-center justify-center relative overflow-hidden">
                     <div 
                        className="relative shadow-2xl rounded-xl overflow-hidden max-h-full border border-[#424245]/50"
                        style={{backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px'}}
                     >
                         <img src={image} alt="Preview" className="max-w-full max-h-[80vh] object-contain" />
                         {loading && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                <Loader2 className="animate-spin text-[#0071e3] mb-4" size={48} />
                                <p className="text-white font-medium animate-pulse">Applying Filter...</p>
                            </div>
                         )}
                     </div>
                </div>

                {/* Controls Area */}
                <div className="w-full lg:w-[350px] bg-[#1c1c1e] border-t lg:border-t-0 lg:border-l border-[#424245] p-6 flex flex-col overflow-y-auto z-10">
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-1 text-white">Filter Settings</h3>
                        <p className="text-xs text-[#86868b]">Apply any style using natural language.</p>
                    </div>

                    <div className="space-y-4 flex-1">
                        
                        {/* Style Match Section */}
                        <div>
                            <label className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider mb-2 block flex items-center gap-2">
                                <ScanEye size={12} /> Style Match
                            </label>
                            
                            <div 
                                className="w-full aspect-[3/1] bg-[#2c2c2e] hover:bg-[#3a3a3c] rounded-xl border border-dashed border-[#424245] hover:border-[#86868b] transition-all cursor-pointer relative overflow-hidden group"
                                onClick={() => refInputRef.current?.click()}
                            >
                                <input 
                                    type="file" 
                                    ref={refInputRef} 
                                    className="hidden" 
                                    onChange={(e) => e.target.files?.[0] && handleRefUpload(e.target.files[0])} 
                                    accept="image/*"
                                />
                                
                                {refImage ? (
                                    <>
                                        <img src={refImage} alt="Ref" className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            {analyzingRef ? (
                                                 <div className="flex flex-col items-center gap-1">
                                                     <Loader2 size={16} className="animate-spin text-[#0071e3]" />
                                                     <span className="text-[10px] text-white font-medium">Extracting Style...</span>
                                                 </div>
                                            ) : (
                                                <div className="bg-black/50 backdrop-blur px-2 py-1 rounded text-[10px] text-white flex items-center gap-1">
                                                    <RefreshCw size={10} /> Change Reference
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#86868b]">
                                        <Upload size={16} />
                                        <span className="text-[10px] font-medium">Upload Reference Photo</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-[#6e6e73] mt-1.5 px-1">
                                Upload an image to auto-generate a matching style prompt.
                            </p>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider mb-2 block">Quick Presets</label>
                            <div className="grid grid-cols-2 gap-2">
                                {presets.map((preset) => (
                                    <button
                                        key={preset.name}
                                        onClick={() => setFilterPrompt(preset.prompt)}
                                        className="bg-[#2c2c2e] hover:bg-[#3a3a3c] text-xs text-[#e5e5e5] py-2.5 px-3 rounded-lg text-left transition-colors border border-transparent hover:border-[#424245]"
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-bold text-[#86868b] uppercase tracking-wider mb-2 block flex items-center gap-2">
                                <Sparkles size={10} /> Custom Prompt
                            </label>
                            <div className="relative">
                                <textarea 
                                    value={filterPrompt}
                                    onChange={(e) => setFilterPrompt(e.target.value)}
                                    placeholder="Describe a style (e.g., 'Oil painting by Van Gogh', 'Anime style')..."
                                    className="w-full h-32 bg-[#2c2c2e] border border-transparent focus:border-[#0071e3] rounded-xl p-3 text-sm text-white placeholder-[#6e6e73] outline-none resize-none transition-all pr-10"
                                />
                                <button 
                                    onClick={handleEnhance} 
                                    disabled={!filterPrompt.trim() || enhancing} 
                                    className="absolute bottom-3 right-3 text-[#0071e3] hover:text-[#47a3ff] disabled:text-[#424245] disabled:cursor-not-allowed transition-colors p-2 rounded-full hover:bg-[#3a3a3c]" 
                                    title="Enhance with AI"
                                >
                                    {enhancing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        {error && <p className="text-[#ff453a] text-xs bg-[#ff453a]/10 p-2 rounded text-center">{error}</p>}
                        
                        <button 
                            onClick={handleApply}
                            disabled={loading || !filterPrompt}
                            className="w-full bg-[#0071e3] hover:bg-[#0077ed] disabled:bg-[#2c2c2e] disabled:text-[#86868b] text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
                        >
                            {loading ? 'Processing...' : 'Apply Filter'}
                            {!loading && <Zap size={16} fill="currentColor" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- PROMPT INSPECTOR COMPONENT ---

const PromptInspector = ({ image, onBack, onAuthError }: { image: string; onBack: () => void; onAuthError: () => void }) => {
    const [jsonResult, setJsonResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!image) return;
        analyzeImage();
    }, [image]); // eslint-disable-line react-hooks/exhaustive-deps

    const analyzeImage = async () => {
        setLoading(true);
        setJsonResult(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const imgData = image.split(',')[1];
            const imgMime = image.split(';')[0].split(':')[1];
            
            // Using Gemini 3 Pro Preview as requested for text capabilities
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview', 
                contents: {
                    parts: [
                        { text: "Extract all visual details from this image and convert them into a clean, well-structured JSON prompt. include sections: 'subject', 'clothing', 'hair', 'face', 'accessories', 'environment', 'lighting', 'camera', 'style'. Return ONLY valid JSON." },
                        { inlineData: { mimeType: imgMime, data: imgData } }
                    ]
                },
                config: {
                    responseMimeType: 'application/json'
                }
            });

            setJsonResult(response.text || "{}");
        } catch (e: any) {
            console.error(e);
            if (isAuthError(e)) {
                onAuthError();
            } else {
                setJsonResult(JSON.stringify({ error: "Failed to analyze image." }, null, 2));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (jsonResult) {
            navigator.clipboard.writeText(jsonResult);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-screen bg-[#0a0a0a] relative">
            <div className="flex-none bg-[#1c1c1e] border-b border-[#424245] h-14 px-4 flex items-center justify-between z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#86868b] hover:text-white transition-colors">
                        <ArrowLeft size={16} /> Back
                    </button>
                    <div className="w-px h-4 bg-[#424245]"></div>
                    <span className="text-sm font-medium text-white flex items-center gap-2"><ScanEye size={16} className="text-[#0071e3]" /> Visual Prompt Extractor</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={analyzeImage} disabled={loading} className="text-xs text-[#0071e3] hover:underline disabled:opacity-50 mr-4">
                        Re-analyze
                    </button>
                    <button onClick={handleCopy} disabled={!jsonResult} className="flex items-center gap-2 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        {copied ? "Copied" : "Copy JSON"}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="flex-1 lg:flex-[0.4] bg-black p-8 flex items-center justify-center border-r border-[#424245]/50 relative">
                     <div className="relative shadow-2xl rounded-lg overflow-hidden max-h-full">
                         <img src={image} alt="Source" className="max-w-full max-h-[80vh] object-contain" />
                         <div className="absolute inset-0 border border-white/10 pointer-events-none rounded-lg"></div>
                     </div>
                </div>
                <div className="flex-1 lg:flex-[0.6] bg-[#0d0d0d] flex flex-col relative">
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Loader2 className="animate-spin text-[#0071e3] mb-4" size={32} />
                            <p className="text-[#86868b] text-sm animate-pulse">Analyzing visual structure with Gemini 3...</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto p-6">
                            <pre className="font-mono text-xs sm:text-sm leading-relaxed text-[#a1a1aa] whitespace-pre-wrap break-all">
                                {jsonResult ? (
                                    <code dangerouslySetInnerHTML={{
                                        __html: jsonResult.replace(
                                            /(".*?")(:)/g, 
                                            '<span class="text-[#0071e3]">$1</span>$2'
                                        ).replace(
                                            /(:) (".*?")/g, 
                                            '$1 <span class="text-[#e2e8f0]">$2</span>'
                                        )
                                    }} />
                                ) : (
                                    <span className="text-[#424245]">Waiting for analysis...</span>
                                )}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

interface HistoryItem {
  id: number;
  original: string;
  generated: string;
  prompt: string;
  timestamp: string;
  model: string;
}

interface LearningProfile {
  lightingEmphasis: number;
  blendingStrictness: number;
  corrections: string[];
}

const App = () => {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState("");
  const [blending, setBlending] = useState(50); // 0 to 100
  const [isCompareMode, setIsCompareMode] = useState(false);
  
  // Scene Match State
  const [sceneRefImage, setSceneRefImage] = useState<string | null>(null);
  const [analyzingSceneRef, setAnalyzingSceneRef] = useState(false);
  const sceneRefInputRef = useRef<HTMLInputElement>(null);

  // Default to Nano Banana 1 (id: nano-banana-1)
  const [selectedModel, setSelectedModel] = useState<string>('nano-banana-1');

  const [activeView, setActiveView] = useState<'editor' | 'advanced' | 'gallery' | 'brush' | 'inspector' | 'filters'>('editor');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [feedback, setFeedback] = useState<'liked' | 'disliked' | null>(null); 
  const [showFeedbackOptions, setShowFeedbackOptions] = useState(false);
  const [learningProfile, setLearningProfile] = useState<LearningProfile>({
    lightingEmphasis: 0,
    blendingStrictness: 0,
    corrections: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const presetScenarios = [
    { label: "Studio Light", prompt: "A professional photography studio with soft, diffuse white lighting, infinite background, high-key aesthetic, 8k resolution." },
    { label: "Urban Night", prompt: "A modern city street at night with bokeh city lights, sleek atmosphere, cinematic lighting, sharp focus." },
    { label: "Nature Zen", prompt: "A peaceful japanese garden with soft sunlight filtering through trees, calm atmosphere, natural lighting." },
    { label: "Modern Office", prompt: "A bright, modern minimalist office space with glass walls, daytime lighting, blurred background, professional look." }
  ];

  useEffect(() => {
    async function check() {
        if ((window as any).aistudio) {
            const has = await (window as any).aistudio.hasSelectedApiKey();
            setHasApiKey(has);
        }
        setIsInitialLoad(false);
    }
    check();
  }, []);

  const handleConnect = async () => {
    if ((window as any).aistudio) {
         await (window as any).aistudio.openSelectKey();
         setHasApiKey(true);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Unsupported file format.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setOriginalImage(e.target.result as string);
        setGeneratedImage(null);
        setFeedback(null);
        setShowFeedbackOptions(false);
        setError("");
        setActiveView('editor'); 
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSceneRefUpload = (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          if (e.target?.result) {
              const base64 = e.target.result as string;
              setSceneRefImage(base64);
              analyzeSceneRef(base64);
          }
      };
      reader.readAsDataURL(file);
  };

  const analyzeSceneRef = async (base64: string) => {
      setAnalyzingSceneRef(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const imgData = base64.split(',')[1];
          const imgMime = base64.split(';')[0].split(':')[1];
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: {
                  parts: [
                      { text: "Analyze the uploaded image. Describe the environment, lighting, mood, and scenery in high detail. Output a single, high-quality prompt that can be used to recreate this background." },
                      { inlineData: { mimeType: imgMime, data: imgData } }
                  ]
              },
              config: {
                systemInstruction: "You are a professional visual prompt engineer. Output ONLY the prompt string. No 'Here is a prompt', no markdown formatting."
              }
          });
          
          if (response.text) {
              setPrompt(response.text.trim());
          }
      } catch (e: any) {
          console.error("Scene analysis failed", e);
          if (isAuthError(e)) {
            setHasApiKey(false);
          }
      } finally {
          setAnalyzingSceneRef(false);
      }
  };

  const handleDislike = (reason: string) => {
    setFeedback('disliked');
    setShowFeedbackOptions(false);
    
    let newCorrection = "";
    const newProfile = { ...learningProfile };

    if (reason === 'lighting') {
      newCorrection = "User complained about bad lighting integration previously. FORCE Color Grading and Light Matching.";
      newProfile.lightingEmphasis += 1;
    } else if (reason === 'cutout') {
      newCorrection = "User complained about artificial edges. IMPROVE Edge Blending and Alpha Matting.";
      newProfile.blendingStrictness += 1;
    } else if (reason === 'fake') {
      newCorrection = "User complained result looked fake. INCREASE Photorealism and Texture details.";
    }

    if (newCorrection && !newProfile.corrections.includes(newCorrection)) {
      newProfile.corrections.push(newCorrection);
    }

    setLearningProfile(newProfile);
  };

  const enhancePrompt = async () => {
    if (!prompt.trim()) return;
    setEnhancing(true);
    setError("");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const systemInstruction = `You are a minimalist design expert. Rewrite the user's description into a clean, photorealistic image generation prompt. Focus on lighting quality and composition. Output ONLY the raw prompt string in English.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `User idea: "${prompt}". Make it high-end.`,
        config: {
            systemInstruction: systemInstruction
        }
      });

      const enhancedText = response.text;
      if (enhancedText) setPrompt(enhancedText.trim());
    } catch (err: any) {
      console.error(err);
      if (isAuthError(err)) {
        setHasApiKey(false);
      } else {
        setError("Failed to enhance prompt.");
      }
    } finally {
      setEnhancing(false);
    }
  };

  const applyFilter = async (filterPrompt: string) => {
      if (!originalImage) return;
      setLoading(true);
      setError("");

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const imgData = originalImage.split(',')[1];
          const imgMime = originalImage.split(';')[0].split(':')[1];

          // Use the currently active model (likely Nano Banana 1 if 2 is disabled)
          const selectedModelConfig = MODELS.find(m => m.id === selectedModel) || MODELS[0];
          const modelName = selectedModelConfig.apiModel;

          const fullPrompt = `
            TASK: Apply a visual style filter to the image.
            STYLE: "${filterPrompt}"
            CONSTRAINT: Keep the original composition, subject, and geometry EXACTLY the same. Only change lighting, colors, and texture to match the requested style.
            High quality, detailed, photorealistic (unless style implies otherwise).
          `;

          const response = await ai.models.generateContent({
              model: modelName,
              contents: {
                  parts: [
                      { text: fullPrompt },
                      { inlineData: { mimeType: imgMime, data: imgData } }
                  ]
              }
          });

          let generatedBase64 = null;
          if (response.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData) {
                      generatedBase64 = part.inlineData.data;
                      break;
                  }
              }
          }

          if (generatedBase64) {
              const newImage = `data:image/png;base64,${generatedBase64}`;
              setGeneratedImage(newImage);
              setHistory(prev => [{
                  id: Date.now(),
                  original: originalImage,
                  generated: newImage,
                  prompt: `Filter: ${filterPrompt}`,
                  timestamp: new Date().toLocaleTimeString(),
                  model: selectedModel
              }, ...prev]);
              
              setActiveView('editor');
          } else {
              throw new Error("No image generated.");
          }

      } catch (err: any) {
          console.error(err);
          if (isAuthError(err)) {
              setHasApiKey(false);
          } else {
              setError("Failed to apply filter.");
          }
      } finally {
          setLoading(false);
      }
  };

  const generateWithMask = async (maskBase64: string, maskPrompt: string) => {
    if (!originalImage) return;
    setLoading(true);
    setError("");

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Extract base64 data strings
        const imgData = originalImage.split(',')[1];
        const imgMime = originalImage.split(';')[0].split(':')[1];
        const maskData = maskBase64.split(',')[1];
        
        const selectedModelConfig = MODELS.find(m => m.id === selectedModel) || MODELS[0];
        const modelName = selectedModelConfig.apiModel;

        const fullPrompt = `
            Perform a localized edit on the image using the provided mask.
            Instruction: "${maskPrompt}".
            The second image provided is a mask where WHITE pixels indicate the area to edit.
            Keep all areas outside the mask strictly unchanged.
            High quality, photorealistic, seamless blending.
        `;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: fullPrompt },
                    { inlineData: { mimeType: imgMime, data: imgData } },
                    { inlineData: { mimeType: 'image/png', data: maskData } }
                ]
            }
        });

        let generatedBase64 = null;
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    generatedBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (generatedBase64) {
            const newImage = `data:image/png;base64,${generatedBase64}`;
            setGeneratedImage(newImage);
            setHistory(prev => [{
                id: Date.now(),
                original: originalImage,
                generated: newImage,
                prompt: maskPrompt,
                timestamp: new Date().toLocaleTimeString(),
                model: selectedModel
            }, ...prev]);
            
            // Go back to studio to show result
            setActiveView('editor');
        } else {
            throw new Error("No image generated.");
        }

    } catch (err: any) {
        console.error(err);
        if (isAuthError(err)) {
            setHasApiKey(false);
        } else {
            setError("Error generating edit. Please try again.");
        }
    } finally {
        setLoading(false);
    }
  };

  const generateNewBackground = async () => {
    if (!originalImage || !prompt.trim()) return;
    setLoading(true);
    setError("");
    setFeedback(null);
    setShowFeedbackOptions(false);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = originalImage.split(',')[1];
      const mimeType = originalImage.split(';')[0].split(':')[1];
      
      let adaptiveInstructions = "";
      if (learningProfile.corrections.length > 0) {
        adaptiveInstructions = `ADAPTIVE LEARNING: ${learningProfile.corrections.join('. ')}`;
      }
      
      let blendingInstruction = "";
      if (blending < 30) {
          blendingInstruction = "Keep original subject lighting and colors strictly. Minimal blending with background. Cutout aesthetic.";
      } else if (blending > 70) {
          blendingInstruction = "Aggressive blending. Heavily relight and color-grade the subject to fully immerse them in the new atmosphere. Modify subject lighting significantly.";
      } else {
          blendingInstruction = "Balanced blending. Relight subject naturally to match the environment.";
      }

      const selectedModelConfig = MODELS.find(m => m.id === selectedModel) || MODELS[0];
      const modelName = selectedModelConfig.apiModel;

      let fullPrompt = `
        TASK: Professional Background Replacement.
        STYLE: High-end commercial photography, clean, sharp.
        INSTRUCTION: Keep the subject structure. Replace background with: "${prompt}".
        BLENDING: ${blendingInstruction} (Strength: ${blending}/100)
        TECHNICAL: Seamless compositing.
        ${adaptiveInstructions}
      `;

      const contentsParts: any[] = [
          { text: fullPrompt },
          { inlineData: { mimeType: mimeType, data: base64Data } }
      ];

      // Add Reference Scenario if available
      if (sceneRefImage) {
          const refData = sceneRefImage.split(',')[1];
          const refMime = sceneRefImage.split(';')[0].split(':')[1];
          contentsParts.push({ inlineData: { mimeType: refMime, data: refData } });
          // Update prompt to acknowledge reference
          contentsParts[0].text += " Use the second image provided as a strict visual reference for the background style, lighting, and composition.";
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
            parts: contentsParts
        }
      });

      let generatedBase64 = null;
      if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                  generatedBase64 = part.inlineData.data;
                  break;
              }
          }
      }

      if (generatedBase64) {
        const newImage = `data:image/png;base64,${generatedBase64}`;
        setGeneratedImage(newImage);
        
        setHistory(prev => [{
          id: Date.now(),
          original: originalImage,
          generated: newImage,
          prompt: prompt,
          timestamp: new Date().toLocaleTimeString(),
          model: selectedModel
        }, ...prev]);

      } else {
        throw new Error("No image generated.");
      }

    } catch (err: any) {
      console.error(err);
      if (isAuthError(err)) {
        setHasApiKey(false);
      } else {
        setError("Error generating image. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setOriginalImage(null);
    setGeneratedImage(null);
    setSceneRefImage(null);
    setPrompt("");
    setError("");
    setFeedback(null);
    setShowFeedbackOptions(false);
    setIsCompareMode(false);
    setActiveView('editor');
  };

  const loadFromHistory = (item: HistoryItem) => {
    setOriginalImage(item.original);
    setGeneratedImage(item.generated);
    setPrompt(item.prompt);
    setActiveView('editor');
  };

  if (isInitialLoad) {
    return (
        <div className="h-screen bg-black flex items-center justify-center text-white">
            <Loader2 className="animate-spin text-[#0071e3]" size={32} />
        </div>
    );
  }

  if (!hasApiKey) {
      return (
        <div className="h-screen bg-black flex items-center justify-center text-[#f5f5f7] p-6 animate-in fade-in">
            <div className="max-w-md w-full text-center space-y-8">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-[#1c1c1e] rounded-3xl flex items-center justify-center border border-[#333] shadow-2xl">
                        <Cpu size={40} className="text-[#0071e3]" />
                    </div>
                </div>
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight mb-3">Connect to Intelligence</h1>
                    <p className="text-[#86868b] text-[15px] leading-relaxed">
                        To use Nano Banana 2 (Gemini 3.0 Pro), you must connect your Google Cloud API key.
                    </p>
                </div>
                
                <div className="bg-[#1c1c1e] rounded-2xl p-6 border border-[#333]">
                    <div className="flex items-start gap-3 text-left mb-6">
                        <Key className="text-[#0071e3] mt-1 shrink-0" size={18} />
                        <div>
                            <p className="text-sm font-medium text-white">Pro Access Required</p>
                            <p className="text-xs text-[#86868b] mt-1">This model requires a paid billing project.</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleConnect}
                        className="w-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98]"
                    >
                        Connect API Key
                    </button>
                </div>

                <p className="text-xs text-[#6e6e73]">
                    View <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[#0071e3] hover:underline">Billing Documentation</a>
                </p>
            </div>
        </div>
      );
  }

  return (
    <div className="h-screen bg-black text-[#f5f5f7] font-sans selection:bg-[#0071e3] selection:text-white flex flex-col overflow-hidden">
      
      {activeView === 'advanced' ? (
          <AdvancedCanvas 
            originalImage={originalImage || (history[0]?.original || null)} 
            onBack={() => setActiveView('editor')}
            onAuthError={() => setHasApiKey(false)} 
          />
      ) : activeView === 'brush' ? (
            <BrushEditor 
                image={originalImage || history[0]?.original || ''}
                onBack={() => setActiveView('editor')}
                onGenerate={generateWithMask}
                loading={loading}
                error={error}
            />
      ) : activeView === 'inspector' ? (
            <PromptInspector 
                image={originalImage || history[0]?.original || ''}
                onBack={() => setActiveView('editor')}
                onAuthError={() => setHasApiKey(false)}
            />
      ) : activeView === 'filters' ? (
            <FilterStudio
                image={originalImage || history[0]?.original || ''}
                onBack={() => setActiveView('editor')}
                onApply={applyFilter}
                loading={loading}
                error={error}
            />
      ) : (
        <>
            <nav className="flex-none w-full bg-black/80 backdrop-blur-md z-50 border-b border-white/10 h-11 text-[12px] font-medium tracking-tight">
                <div className="max-w-5xl mx-auto px-6 h-full flex justify-between items-center text-[#e8e8ed]/80">
                <div className="flex items-center gap-6">
                    <button onClick={handleReset} className="hover:text-white transition-colors cursor-pointer"><Aperture size={16} /></button>
                    <button onClick={handleReset} className={`hover:text-white transition-colors cursor-pointer hidden sm:block bg-transparent border-none p-0 font-medium ${activeView === 'editor' ? 'text-white' : ''}`}>Homepage</button>
                    <button onClick={() => originalImage && setActiveView('brush')} className={`hover:text-white transition-colors cursor-pointer hidden sm:flex items-center gap-1 bg-transparent border-none p-0 font-medium ${!originalImage ? 'opacity-50 cursor-not-allowed' : ''}`}>Brush <span className="text-[9px] border border-white/20 px-1 rounded">NEW</span></button>
                    <button onClick={() => originalImage && setActiveView('filters')} className={`hover:text-white transition-colors cursor-pointer hidden sm:flex items-center gap-1 bg-transparent border-none p-0 font-medium ${!originalImage ? 'opacity-50 cursor-not-allowed' : ''}`}>Filters <span className="text-[9px] border border-white/20 px-1 rounded">NEW</span></button>
                    <button onClick={() => originalImage && setActiveView('inspector')} className={`hover:text-white transition-colors cursor-pointer hidden sm:flex items-center gap-1 bg-transparent border-none p-0 font-medium ${!originalImage ? 'opacity-50 cursor-not-allowed' : ''}`}>Prompt</button>
                    <button onClick={() => setActiveView('advanced')} className={`hover:text-[#0071e3] transition-colors cursor-pointer hidden sm:flex items-center gap-1 bg-transparent border-none p-0 font-medium`}>Advanced <span className="text-[9px] border border-white/20 px-1 rounded">PRO</span></button>
                    <button onClick={() => setActiveView('gallery')} className={`hover:text-white transition-colors cursor-pointer hidden sm:block bg-transparent border-none p-0 font-medium ${activeView === 'gallery' ? 'text-white' : ''}`}>Gallery</button>
                    <span className="hover:text-white transition-colors cursor-pointer hidden sm:block opacity-60">Pricing</span>
                    <span className="hover:text-white transition-colors cursor-pointer hidden sm:block opacity-60">About</span>
                </div>
                <div className="flex items-center gap-6">
                    <span className="hover:text-white transition-colors cursor-pointer">Support</span>
                    <span className="hover:text-white transition-colors cursor-pointer"><Smartphone size={14} /></span>
                </div>
                </div>
            </nav>

            <main className="flex-1 flex flex-col overflow-hidden">
                {activeView === 'gallery' ? (
                <div className="flex-1 bg-black p-8 animate-in fade-in duration-500 overflow-y-auto no-scrollbar">
                    <div className="max-w-6xl mx-auto flex flex-col min-h-full">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-3xl font-semibold tracking-tight">Your Gallery</h2>
                        <button onClick={() => setActiveView('editor')} className="text-[#2997ff] hover:text-white text-sm font-medium flex items-center gap-1 transition-colors">
                        <ArrowLeft size={14}/> Back to Studio
                        </button>
                    </div>
                    {history.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-[#86868b]">
                        <LayoutGrid size={48} className="mb-4 opacity-20" />
                        <p className="text-lg font-medium">No creations yet.</p>
                        <button onClick={handleReset} className="mt-4 text-[#2997ff] hover:underline">Start Creating</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {history.map((item) => (
                            <div key={item.id} className="group relative aspect-square bg-[#1c1c1e] rounded-2xl overflow-hidden border border-[#424245]/30 hover:border-[#0071e3] transition-all cursor-pointer" onClick={() => loadFromHistory(item)}>
                            <img src={item.generated} alt={item.prompt} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                <p className="text-white text-sm font-medium line-clamp-2 mb-1">{item.prompt}</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-[#86868b] text-[10px] uppercase tracking-wide border border-[#424245] px-1.5 py-0.5 rounded">{item.model === 'nano-banana-2' ? 'NB-2' : 'NB-1'}</span>
                                    <p className="text-[#86868b] text-xs">{item.timestamp}</p>
                                </div>
                            </div>
                            </div>
                        ))}
                        </div>
                    )}
                    <AppFooter className="mt-auto opacity-50" />
                    </div>
                </div>
                ) : !originalImage ? (
                <div className="flex-1 flex flex-col items-center text-center pt-20 pb-12 animate-in fade-in duration-1000 overflow-y-auto no-scrollbar">
                    <h1 className="text-6xl md:text-7xl font-semibold tracking-tight mb-2">CHANGER AI</h1>
                    <h2 className="text-2xl md:text-3xl font-medium text-[#86868b] mb-8">Pro in every way.</h2>
                    <div className="flex items-center gap-4 mb-16">
                    <button onClick={() => fileInputRef.current?.click()} className="bg-[#0071e3] hover:bg-[#0077ed] text-white px-6 py-2.5 rounded-full font-medium text-[15px] transition-all active:scale-95 shadow-lg shadow-blue-900/20">Upload Photo</button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} accept="image/*" />
                    <button className="text-[#2997ff] hover:text-[#47a3ff] border border-[#2997ff] hover:border-[#47a3ff] px-6 py-2.5 rounded-full font-medium text-[15px] transition-all">View Demo</button>
                    </div>
                    <div className="relative w-full max-w-5xl px-4 aspect-[16/9] md:aspect-[21/9] flex items-center justify-center">
                    <div className="w-full h-full bg-[#1c1c1e] rounded-[40px] overflow-hidden relative group cursor-pointer border border-[#333]" onClick={() => fileInputRef.current?.click()}>
                        <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/10 via-transparent to-blue-500/10 opacity-50"></div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center transition-transform duration-700 group-hover:scale-105">
                            <div className="w-24 h-24 bg-[#2c2c2e] rounded-full flex items-center justify-center mb-6 shadow-2xl border border-[#424245]"><Upload className="text-[#86868b] group-hover:text-white transition-colors" size={32} /></div>
                            <p className="text-[#86868b] font-medium text-lg group-hover:text-white transition-colors">Click to transform instantly</p>
                        </div>
                    </div>
                    </div>
                    <AppFooter className="mt-16 opacity-60" />
                </div>
                ) : (
                <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
                    <div className="flex-1 bg-black relative flex items-center justify-center p-4 lg:p-10 order-2 lg:order-1">
                    <div className="relative w-full h-full max-w-5xl bg-[#1c1c1e] rounded-[30px] overflow-hidden flex items-center justify-center shadow-2xl border border-[#424245]/30">
                        {generatedImage && isCompareMode ? (
                            <CompareSlider original={originalImage!} generated={generatedImage} />
                        ) : (
                            generatedImage ? <img src={generatedImage} alt="Result" className="w-full h-full object-contain animate-in fade-in duration-700" /> : <img src={originalImage} alt="Original" className={`w-full h-full object-contain transition-all duration-700 ${loading ? 'opacity-50 scale-95 blur-sm' : 'opacity-100'}`} />
                        )}
                        <button onClick={handleReset} className="absolute top-6 right-6 bg-[#3a3a3c]/80 backdrop-blur hover:bg-[#48484a] text-white p-2.5 rounded-full transition-all z-20" title="Close"><X size={18} /></button>
                        {loading && <div className="absolute inset-0 flex flex-col items-center justify-center z-10"><div className="w-16 h-16 mb-4"><Loader2 className="w-full h-full text-[#0071e3] animate-spin" /></div><p className="text-[#86868b] font-medium tracking-wide animate-pulse">Processing Intelligence...</p></div>}
                        {generatedImage && (
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-20">
                            {!feedback && !showFeedbackOptions ? <div className="bg-[#3a3a3c]/90 backdrop-blur-xl px-2 py-2 rounded-full flex items-center gap-2 border border-white/10 shadow-lg"><button onClick={() => setFeedback('liked')} className="p-2 hover:bg-[#48484a] rounded-full transition-colors text-[#f5f5f7]"><ThumbsUp size={20} /></button><div className="w-px h-4 bg-white/20"></div><button onClick={() => setShowFeedbackOptions(true)} className="p-2 hover:bg-[#48484a] rounded-full transition-colors text-[#f5f5f7]"><ThumbsDown size={20} /></button></div> : feedback === 'liked' ? <div className="bg-[#0071e3] text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg"><CheckCircle2 size={16} /> Saved to preferences</div> : showFeedbackOptions ? <div className="bg-[#1c1c1e]/95 backdrop-blur-xl border border-[#424245] p-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4"><p className="text-xs font-medium text-[#86868b] mb-3 text-center">Improve next time?</p><div className="flex flex-col gap-2 w-48"><button onClick={() => handleDislike('lighting')} className="text-sm text-left px-3 py-2 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white transition-colors">Lighting Mismatch</button><button onClick={() => handleDislike('cutout')} className="text-sm text-left px-3 py-2 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white transition-colors">Bad Edges</button><button onClick={() => handleDislike('fake')} className="text-sm text-left px-3 py-2 rounded-lg bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white transition-colors">Looks Fake</button></div></div> : null}
                            <button 
                                onClick={() => setIsCompareMode(!isCompareMode)}
                                className={`p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center ${isCompareMode ? 'bg-white text-black' : 'bg-[#0071e3] hover:bg-[#0077ed] text-white'}`}
                                title="Compare Original vs Result"
                            >
                                <SplitSquareHorizontal size={20} />
                            </button>
                            <a href={generatedImage} download="changer-pro.png" className="bg-[#0071e3] hover:bg-[#0077ed] text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center"><Download size={20} /></a>
                            </div>
                        )}
                    </div>
                    </div>
                    <div className="w-full lg:w-[400px] bg-black border-l border-[#424245]/30 p-8 flex flex-col order-1 lg:order-2 z-10 h-full overflow-y-auto no-scrollbar">
                    <div className="mb-8">
                        <h3 className="text-2xl font-semibold mb-2">Studio</h3>
                        <p className="text-[#86868b] text-[15px] leading-relaxed">Customize your environment with precision. Choose the ideal intelligence for your project.</p>
                    </div>
                    <div className="flex-1 flex flex-col gap-6">
                        {/* MAIN MODEL SELECTOR */}
                        <div className="space-y-2">
                            <label className="text-[13px] font-medium text-[#86868b] uppercase tracking-wide flex items-center gap-2"><Cpu size={12}/> Active Intelligence</label>
                            <div className="flex gap-2 bg-[#1c1c1e] p-1 rounded-xl border border-[#424245]/50">
                                {MODELS.map(m => (
                                    <button
                                        key={m.id}
                                        disabled={m.disabled}
                                        onClick={() => setSelectedModel(m.id)}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex flex-col items-center gap-0.5 ${selectedModel === m.id ? 'bg-[#3a3a3c] text-white shadow-md' : 'text-[#86868b] hover:text-white'} ${m.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                        title={m.disabled ? "Currently unavailable" : ""}
                                    >
                                        <span className="flex items-center gap-1">
                                            {m.disabled && <Lock size={10} />}
                                            {m.name}
                                        </span>
                                        {m.id === 'nano-banana-2' && <span className="text-[9px] text-[#0071e3]">{m.disabled ? 'COMING SOON' : 'NEW'}</span>}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-[#6e6e73] px-1">
                                {MODELS.find(m => m.id === selectedModel)?.description}
                            </p>
                        </div>

                         {/* SCENE MATCH UPLOAD */}
                        <div>
                            <label className="text-[13px] font-medium text-[#86868b] uppercase tracking-wide flex items-center gap-2 mb-2">
                                <ImagePlus size={12} /> Reference Scenario
                            </label>
                            <div 
                                className="w-full h-16 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-xl border border-dashed border-[#424245] hover:border-[#86868b] transition-all cursor-pointer relative overflow-hidden group flex items-center justify-center"
                                onClick={() => sceneRefInputRef.current?.click()}
                            >
                                <input 
                                    type="file" 
                                    ref={sceneRefInputRef} 
                                    className="hidden" 
                                    onChange={(e) => e.target.files?.[0] && handleSceneRefUpload(e.target.files[0])} 
                                    accept="image/*"
                                />
                                {sceneRefImage ? (
                                    <>
                                        <img src={sceneRefImage} alt="Ref" className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            {analyzingSceneRef ? (
                                                 <div className="flex items-center gap-2">
                                                     <Loader2 size={16} className="animate-spin text-[#0071e3]" />
                                                     <span className="text-[10px] text-white font-medium">Analyzing...</span>
                                                 </div>
                                            ) : (
                                                <div className="bg-black/50 backdrop-blur px-2 py-1 rounded text-[10px] text-white flex items-center gap-1">
                                                    <RefreshCw size={10} /> Change
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-2 text-[#86868b]">
                                        <Upload size={14} />
                                        <span className="text-[11px] font-medium">Upload Background Base</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                        <label className="text-[13px] font-medium text-[#86868b] uppercase tracking-wide">Scene Description</label>
                        <div className="relative">
                            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex: A modern office with a view of the ocean..." className="w-full bg-[#1c1c1e] text-white border border-transparent focus:border-[#0071e3] rounded-2xl p-4 text-[16px] leading-relaxed placeholder-[#6e6e73] outline-none transition-all resize-none h-32" />
                            <button onClick={enhancePrompt} disabled={!prompt.trim() || enhancing} className="absolute bottom-3 right-3 text-[#0071e3] hover:text-[#47a3ff] disabled:text-[#424245] disabled:cursor-not-allowed transition-colors p-2 rounded-full hover:bg-[#2c2c2e]" title="Enhance with AI">
                            {enhancing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            </button>
                        </div>
                        </div>
                        
                        {/* BLENDING STRICTNESS SLIDER */}
                        <div className="space-y-3">
                            <label className="text-[13px] font-medium text-[#86868b] uppercase tracking-wide flex items-center gap-2">
                                <Blend size={12} /> Blending Level
                            </label>
                            <div className="flex items-center gap-3 bg-[#1c1c1e] p-3 rounded-xl border border-[#424245]/50">
                                <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider">Original</span>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    value={blending} 
                                    onChange={(e) => setBlending(parseInt(e.target.value))}
                                    className="flex-1 h-1 bg-[#424245] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
                                />
                                <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider">Immersive</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                        <label className="text-[13px] font-medium text-[#86868b] uppercase tracking-wide flex items-center gap-2"><Sliders size={12} /> Pro Suggestions</label>
                        <div className="grid grid-cols-2 gap-3">
                            {presetScenarios.map((s, i) => (
                            <button key={i} onClick={() => setPrompt(s.prompt)} className="text-left px-4 py-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-xl text-[14px] text-[#f5f5f7] transition-colors border border-transparent hover:border-[#424245]">{s.label}</button>
                            ))}
                        </div>
                        </div>
                        <div className="mt-auto pt-6">
                        <button onClick={generateNewBackground} disabled={loading || !prompt} className="w-full bg-[#0071e3] hover:bg-[#0077ed] disabled:bg-[#3a3a3c] disabled:text-[#86868b] text-white font-medium text-[17px] py-4 rounded-full transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-blue-900/10">
                            {loading ? 'Processing...' : `Transform with ${selectedModel === 'nano-banana-2' ? 'NB-2' : 'NB-1'}`}
                            {!loading && <ChevronRight size={18} />}
                        </button>
                        {error && <p className="text-[#ff453a] text-sm mt-3 text-center bg-[#ff453a]/10 py-2 rounded-lg">{error}</p>}
                        
                        <div className="mt-8 border-t border-[#424245]/30 pt-4">
                            <AppFooter />
                        </div>
                        </div>
                    </div>
                    </div>
                </div>
                )}
            </main>
        </>
      )}
    </div>
  );
};

export default App;