import React from 'react';
import { Eraser, FileText } from 'lucide-react';

export function Header({ serverOnline }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl bg-[#0a0e1a]/90 border-b border-white/10 shadow-lg shadow-black/10">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-2xl blur-md opacity-75 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-900/30 group-hover:scale-105 transition-transform duration-300">
              <Eraser className="text-white w-6 h-6" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black font-heading text-white leading-none tracking-tight">
              Magic Eraser <span className="text-gradient">Pro</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-0.5 uppercase">
              GPU Accelerated · AI Powered
            </p>
          </div>
        </div>

        {/* Right side - API docs and Server status */}
        <div className="flex items-center gap-3">
          <a
            href="http://localhost:3099/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl glass border-white/10 backdrop-blur-sm hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300 transition-all duration-300 text-slate-300 text-xs font-bold tracking-wider"
          >
            <FileText className="w-4 h-4" />
            接口文档
          </a>

          <div className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-xl glass border-white/10 backdrop-blur-sm hover:border-white/20 transition-all duration-300">
            <div className="relative">
              <div className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              {serverOnline && (
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
              )}
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${serverOnline ? 'text-emerald-400' : 'text-red-400'}`}>
              {serverOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
