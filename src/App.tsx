/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { 
  Upload, 
  Play, 
  Pause, 
  Eye, 
  EyeOff, 
  GripVertical, 
  Trash2, 
  Layers,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw
} from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'motion/react';

interface Layer {
  id: string;
  name: string;
  blobUrl: string;
  visible: boolean;
  opacity: number;
  order: number;
  error?: string;
}

export default function App() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle files (ZIP or direct videos)
  const handleFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setIsLoading(true);
    const newLayers: Layer[] = [];

    try {
      for (const file of fileList) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        if (ext === '.zip') {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          
          for (const [filename, fileData] of Object.entries(contents.files)) {
            const innerExt = filename.substring(filename.lastIndexOf('.')).toLowerCase();
            const isHidden = filename.startsWith('__MACOSX/') || filename.split('/').some(part => part.startsWith('.'));
            
            if (!fileData.dir && !isHidden && (innerExt === '.webm' || innerExt === '.mp4' || innerExt === '.mov' || innerExt === '.mkv')) {
              const blob = await fileData.async('blob');
              if (blob.size === 0) continue;
              
              const url = URL.createObjectURL(blob);
              newLayers.push({
                id: crypto.randomUUID(),
                name: filename,
                blobUrl: url,
                visible: true,
                opacity: 1,
                order: 0, // Will be set after sorting
              });
            }
          }
        } else if (ext === '.webm' || ext === '.mp4' || ext === '.mov' || ext === '.mkv') {
          if (file.size === 0) continue;
          const url = URL.createObjectURL(file);
          newLayers.push({
            id: crypto.randomUUID(),
            name: file.name,
            blobUrl: url,
            visible: true,
            opacity: 1,
            order: 0, // Will be set after sorting
          });
        }
      }

      if (newLayers.length === 0 && layers.length === 0) {
        alert('No se encontraron archivos de video compatibles.');
      } else {
        setLayers(prev => {
          const combined = [...prev, ...newLayers];
          // Sort alphabetically by name
          const sorted = combined.sort((a, b) => a.name.localeCompare(b.name));
          // Update order based on sorted position (top of list = highest z-index)
          // Actually, in the player we reverse, so index 0 is top of list, index N-1 is bottom.
          // To have top of list be top visually, index 0 should have highest z-index.
          return sorted.map((layer, idx) => ({
            ...layer,
            order: sorted.length - 1 - idx
          }));
        });
      }
    } catch (error) {
      console.error('Error al procesar los archivos:', error);
      alert('Error al procesar los archivos.');
    } finally {
      setIsLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      layers.forEach(layer => URL.revokeObjectURL(layer.blobUrl));
    };
  }, []);

  const clearAll = () => {
    layers.forEach(layer => URL.revokeObjectURL(layer.blobUrl));
    setLayers([]);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  // Sync UI with playback
  useEffect(() => {
    const videos = Object.values(videoRefs.current).filter((v): v is HTMLVideoElement => v !== null);
    const masterVideo = videos.find(v => {
      const layerId = Object.keys(videoRefs.current).find(key => videoRefs.current[key] === v);
      const layer = layers.find(l => l.id === layerId);
      return layer && !layer.error;
    });

    if (!masterVideo) return;

    const handleTimeUpdate = () => {
      setCurrentTime(masterVideo.currentTime);
    };

    const handleLoadedMetadata = () => {
      // Set duration to the maximum duration found among all videos
      const maxDuration = Math.max(...videos.map(v => v.duration || 0));
      setDuration(maxDuration);
    };

    masterVideo.addEventListener('timeupdate', handleTimeUpdate);
    // Also check other videos for duration
    videos.forEach(v => v.addEventListener('loadedmetadata', handleLoadedMetadata));

    return () => {
      masterVideo.removeEventListener('timeupdate', handleTimeUpdate);
      videos.forEach(v => v.removeEventListener('loadedmetadata', handleLoadedMetadata));
    };
  }, [layers]);

  const togglePlay = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    Object.values(videoRefs.current).forEach(v => {
      if (v instanceof HTMLVideoElement) {
        nextState ? v.play() : v.pause();
      }
    });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    Object.values(videoRefs.current).forEach(v => {
      if (v instanceof HTMLVideoElement) {
        v.currentTime = time;
      }
    });
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const updateLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l));
  };

  const removeLayer = (id: string) => {
    setLayers(prev => {
      const layer = prev.find(l => l.id === id);
      if (layer) URL.revokeObjectURL(layer.blobUrl);
      return prev.filter(l => l.id !== id);
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#151619] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-white">
      {/* Header */}
      <header className="border-bottom border-[#141414] p-4 flex items-center justify-between bg-[#1a1b1e]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#F27D26] rounded flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-mono text-sm uppercase tracking-widest font-bold">Video Layer Inspector</h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono opacity-60">
          <span>{layers.length} CAPAS CARGADAS</span>
          <div className="h-4 w-[1px] bg-[#141414]" />
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      </header>

      <main className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Left Panel: Layer Manager */}
        <aside className="w-80 border-r border-[#141414] bg-[#1a1b1e] flex flex-col">
          <div className="p-4 border-b border-[#141414] flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-tighter opacity-50">Gestor de Capas</h2>
            <button 
              onClick={clearAll}
              className="p-1 hover:bg-[#141414] rounded transition-colors text-red-400"
              title="Limpiar todo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {layers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
                <Upload className="w-12 h-12 mb-4" />
                <p className="text-sm">Arrastra ZIP o videos aquí para empezar</p>
              </div>
            ) : (
              <Reorder.Group 
                axis="y" 
                values={layers} 
                onReorder={(newOrder) => {
                  // When manually reordering, we update the order property to match visual stack
                  setLayers(newOrder.map((layer, idx) => ({
                    ...layer,
                    order: newOrder.length - 1 - idx
                  })));
                }} 
                className="space-y-2"
              >
                {layers.map((layer) => (
                  <Reorder.Item 
                    key={layer.id} 
                    value={layer}
                    className={`bg-[#232429] border ${layer.error ? 'border-red-500/50' : 'border-2d2e35'} rounded-lg p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-lg ${!layer.visible ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <GripVertical className="w-4 h-4 opacity-30" />
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-mono truncate" title={layer.name}>
                          {layer.name}
                        </span>
                        {layer.error && (
                          <span className="text-[9px] text-red-400 font-mono block leading-tight">
                            {layer.error}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => toggleLayerVisibility(layer.id)}
                          className="p-1.5 hover:bg-[#2d2e35] rounded transition-colors"
                        >
                          {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-red-400" />}
                        </button>
                        <button 
                          onClick={() => removeLayer(layer.id)}
                          className="p-1.5 hover:bg-[#2d2e35] rounded transition-colors text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 pl-7">
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        value={layer.opacity} 
                        onChange={(e) => updateLayerOpacity(layer.id, parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-[#141414] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
                      />
                      <span className="text-[10px] font-mono w-8 text-right opacity-50">
                        {Math.round(layer.opacity * 100)}%
                      </span>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>
        </aside>

        {/* Right Panel: Player */}
        <section 
          className={`flex-1 relative flex flex-col bg-[#0a0a0a] transition-colors ${isDragging ? 'bg-[#1a1b1e]' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {/* Video Container */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-8">
            {layers.length === 0 ? (
              <div className="text-center">
                <div className="w-24 h-24 border-2 border-dashed border-[#2d2e35] rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Upload className="w-10 h-10 opacity-20" />
                </div>
                <h3 className="text-xl font-light mb-2">Suelte el ZIP o videos de procesamiento</h3>
                <p className="text-sm opacity-40 max-w-xs mx-auto">
                  Soporta archivos .zip o selección múltiple de videos WebM, MP4 o MOV.
                </p>
              </div>
            ) : (
              <div 
                ref={containerRef}
                className="relative aspect-video w-full max-w-5xl bg-black shadow-2xl rounded-lg overflow-hidden border border-[#141414]"
              >
                {/* Checkerboard background for transparency visualization */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                
                {/* Video Layers */}
                {[...layers].reverse().map((layer) => (
                  <video
                    key={layer.id}
                    ref={el => videoRefs.current[layer.id] = el}
                    src={layer.blobUrl}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    style={{ 
                      opacity: layer.visible && !layer.error ? layer.opacity : 0,
                      zIndex: layer.order 
                    }}
                    muted={isMuted}
                    playsInline
                    loop
                    preload="auto"
                    onError={(e) => {
                      const video = e.currentTarget;
                      let errorMsg = 'Error de carga';
                      if (video.error) {
                        switch (video.error.code) {
                          case 1: errorMsg = 'Abortado'; break;
                          case 2: errorMsg = 'Error de red'; break;
                          case 3: errorMsg = 'Error de decodificación (Codec)'; break;
                          case 4: errorMsg = 'Formato no soportado'; break;
                        }
                      }
                      console.error(`Error en capa "${layer.name}":`, video.error);
                      setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, error: errorMsg } : l));
                    }}
                  />
                ))}
              </div>
            )}

            {/* Loading Overlay */}
            <AnimatePresence>
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50"
                >
                  <div className="w-12 h-12 border-4 border-[#F27D26] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-mono text-xs uppercase tracking-widest">Procesando ZIP...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls Bar */}
          <div className="h-24 bg-[#1a1b1e] border-t border-[#141414] px-6 flex flex-col justify-center gap-2">
            {/* Seek Bar */}
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono opacity-50 w-10">{formatTime(currentTime)}</span>
              <input 
                type="range" 
                min="0" 
                max={duration || 0} 
                step="0.01" 
                value={currentTime} 
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-[#141414] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
              />
              <span className="text-[10px] font-mono opacity-50 w-10">{formatTime(duration)}</span>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={togglePlay}
                  disabled={layers.length === 0}
                  className="w-10 h-10 rounded-full bg-[#F27D26] hover:bg-[#ff8c3a] flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  {isPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current ml-0.5" />}
                </button>
                
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 hover:bg-[#2d2e35] rounded transition-colors"
                >
                  {isMuted ? <VolumeX className="w-5 h-5 opacity-60" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">Formato Recomendado</span>
                  <span className="text-[10px] font-mono text-[#F27D26]">WebM / VP9 + Alpha</span>
                </div>
                <button className="p-2 hover:bg-[#2d2e35] rounded transition-colors">
                  <Maximize2 className="w-5 h-5 opacity-60" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Global Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#F27D26]/10 border-4 border-dashed border-[#F27D26] pointer-events-none flex items-center justify-center"
          >
            <div className="bg-[#1a1b1e] p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
              <Upload className="w-16 h-16 text-[#F27D26]" />
              <p className="text-2xl font-light">Suelta tus archivos para cargar las capas</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
