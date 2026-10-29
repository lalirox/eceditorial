import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, XTrend, DEFAULT_X_TRENDS } from './services/gemini.service';
import { MatrixRainComponent } from './components/matrix-rain.component';

interface NewsVersion {
  label: string;
  whatsappBody: string;
  wordCount: number;
}

interface NewsItem {
  category: string;
  title: string;
  whatsappBody: string;
  twitterBody: string;
  hashtags: string;
  imagePrompt: string;
  videoPrompt: string;
  sourceUrl?: string;
  // Feature 1: Versioning & Quick Adjustments
  versions?: NewsVersion[];
  activeVersionIndex?: number;
  isAdjusting?: boolean;
  adjustmentError?: string;
  // Feature: X Post Formats & Versioning
  twitterVersions?: { label: string; twitterBody: string }[];
  activeTwitterVersionIndex?: number;
  isAdjustingTwitter?: boolean;
  twitterAdjustmentError?: string;
  // Feature: Trends selector
  showTrendSelector?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, MatrixRainComponent],
  template: `
<div class="min-h-screen bg-neutral-950 text-neutral-100 pb-20 font-sans selection:bg-teal-500 selection:text-white" [attr.data-agent-state]="agentStateStr()">
  <!-- DATA LAYER FOR AI AGENTS -->
  <div id="ai-agent-data-layer" style="display: none;" aria-hidden="true" data-agent-id="ai-layer">
    <span data-agent-id="status">{{ agentStateStr() }}</span>
    <span data-agent-id="error-msg">{{ error() || 'null' }}</span>
    <pre data-agent-id="json-output">{{ agentOutputJson() }}</pre>
    <pre data-agent-id="topics-available">{{ availableTopicsJson() }}</pre>
  </div>

  <!-- Header -->
  <header class="bg-neutral-900/80 border-b border-neutral-800 shadow-lg sticky top-0 z-30 backdrop-blur-md">
    <div class="max-w-6xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="bg-gradient-to-br from-teal-500 to-emerald-600 p-2 rounded-xl shadow-lg shadow-teal-900/20 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <div class="leading-tight">
            <h1 class="text-lg sm:text-xl font-bold text-white tracking-tight">
              Entendiendo Cosas <span class="text-teal-400">AI</span>
            </h1>
            <p class="text-[11px] sm:text-xs text-neutral-400 font-medium tracking-wide uppercase">Asistente Editorial • México</p>
          </div>
        </div>
        <div class="hidden sm:block">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-800 text-teal-400 border border-neutral-700">
            <span class="w-2 h-2 rounded-full bg-teal-500 mr-2 animate-pulse"></span>
            Google Search Activado
          </span>
        </div>
        <!-- Mobile Status Indicator -->
        <div class="block sm:hidden">
          <div class="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.6)]" title="Google Search Activado"></div>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    
    <!-- Controls Section -->
    <section class="bg-neutral-900/50 rounded-2xl border border-neutral-800 p-4 sm:p-6 mb-8 backdrop-blur-sm" style="background-image: radial-gradient(circle at top left, rgba(20, 184, 166, 0.05), transparent 30%), radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.03), transparent 30%);">
      <div class="flex items-center gap-3 mb-5">
         <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-teal-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
         </svg>
         <h2 class="text-base sm:text-lg font-semibold text-white tracking-wider">Centro de Mando</h2>
      </div>

      <!-- Custom Search Input -->
      <div class="mb-6 relative group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          @if (isUrl()) {
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          } @else {
            <svg class="h-5 w-5 text-neutral-500 group-focus-within:text-teal-400 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
          }
        </div>
        <input 
          type="text" 
          [value]="customQuery()"
          (input)="onCustomQueryInput($event)"
          data-agent-id="input-query"
          [placeholder]="isUrl() ? 'Enlace detectado. Listo para analizar.' : 'Pega un ENLACE de noticia o escribe un tema...'"
          class="block w-full pl-10 pr-3 py-3 border rounded-xl leading-5 bg-neutral-950 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 sm:text-sm transition-all shadow-inner"
          [class]="isUrl() 
            ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
            : 'border-neutral-700 focus:border-teal-500 focus:ring-teal-500/50'"
        />
        <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          @if (isUrl()) {
             <span class="text-[10px] font-bold text-emerald-400 bg-emerald-900/30 border border-emerald-800 rounded px-1.5 py-0.5 tracking-wider">LINK DETECTADO</span>
          } @else {
             <span class="text-xs text-neutral-600 border border-neutral-800 rounded px-1.5 py-0.5">Opcional</span>
          }
        </div>
      </div>
      
      <!-- Radar de Tendencias en X (Twitter) -->
      <div class="mb-6 p-3.5 sm:p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 shadow-md backdrop-blur-sm">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-lg bg-black border border-neutral-700 text-white flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" class="h-4 w-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xs sm:text-sm font-bold text-white tracking-wide">Radar de Tendencias en X (Twitter)</h3>
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-400 border border-sky-800">
                  <span class="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1 animate-pulse"></span>
                  En Vivo Hoy
                </span>
              </div>
              <p class="text-[11px] text-neutral-400">Hashtags y temas calientes en México y el mundo para potenciar el alcance de tus publicaciones</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <!-- Toggle Auto-link -->
            <button 
              (click)="toggleAutoLinkXTrends()"
              [title]="autoLinkXTrends() ? 'La IA conectará automáticamente hashtags en tendencia afines a la noticia investigada' : 'Vincular tendencias desactivado'"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
              [class]="autoLinkXTrends() 
                ? 'bg-sky-950/80 text-sky-300 border-sky-600/70 shadow-[0_0_12px_rgba(14,165,233,0.2)]' 
                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200'">
              <span class="w-2 h-2 rounded-full" [class]="autoLinkXTrends() ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]' : 'bg-neutral-600'"></span>
              <span>{{ autoLinkXTrends() ? 'Vincular a notas: SÍ' : 'Vincular a notas: NO' }}</span>
            </button>

            <!-- Refresh Button -->
            <button 
              [disabled]="isLoadingTrends()"
              (click)="loadXTrends()"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 hover:text-white transition-all disabled:opacity-40 cursor-pointer shadow-sm">
              @if (isLoadingTrends()) {
                <svg class="animate-spin h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Escaneando X...</span>
              } @else {
                <svg class="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Actualizar</span>
              }
            </button>
          </div>
        </div>

        <!-- Trends Chips Row -->
        <div class="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
          @for (trend of xTrends(); track trend.hashtag; let i = $index) {
            <div 
              class="group/chip relative flex items-center gap-1.5 bg-neutral-950/80 hover:bg-neutral-800/90 border border-neutral-800 hover:border-sky-500/50 rounded-lg px-2.5 py-1.5 transition-all text-xs">
              <span class="text-[10px] font-mono text-neutral-500 group-hover/chip:text-sky-400 font-bold">#{{ i + 1 }}</span>
              <button 
                (click)="copyTrend(trend.hashtag)"
                [title]="trend.summary ? trend.summary : 'Copiar hashtag ' + trend.hashtag"
                class="font-semibold text-neutral-200 group-hover/chip:text-white hover:underline flex items-center gap-1 cursor-pointer">
                {{ trend.hashtag }}
              </button>
              @if (trend.postsCount) {
                <span class="text-[10px] text-neutral-500 group-hover/chip:text-neutral-400 font-mono">({{ trend.postsCount }})</span>
              }
              <button
                (click)="addTrendToAllOrActive(trend.hashtag)"
                title="Añadir este hashtag a todas las notas generadas"
                class="ml-1 text-sky-400 hover:text-white hover:bg-sky-600/40 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer">
                + Añadir a notas
              </button>
            </div>
          }
        </div>

        <!-- Feedback message if trend added or copied -->
        @if (trendFeedbackMessage()) {
          <div class="mt-2 text-xs text-sky-300 bg-sky-950/60 border border-sky-800/60 rounded px-3 py-1 flex items-center justify-between animate-in fade-in">
            <span>{{ trendFeedbackMessage() }}</span>
            <button (click)="trendFeedbackMessage.set(null)" class="text-neutral-400 hover:text-white ml-2 cursor-pointer">✕</button>
          </div>
        }
      </div>
      
      <!-- Topics Grid -->
      <h3 class="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">FILTRAR POR TEMAS</h3>
      <div class="flex flex-wrap gap-2.5 mb-4" data-agent-id="topics-container">
        @for (topic of availableTopics; track topic) {
          <button 
            (click)="toggleTopic(topic)"
            [attr.data-agent-id]="'btn-topic-' + topic"
            class="px-4 py-2.5 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-all duration-300 border select-none touch-manipulation active:scale-95 transform"
            [class]="isTopicSelected(topic) 
              ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 hover:bg-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.3),_inset_0_0_5px_rgba(20,184,166,0.2)]' 
              : 'bg-neutral-800/50 text-neutral-400 border-neutral-700/50 hover:bg-neutral-750/50 hover:text-neutral-200 hover:border-neutral-600/50'">
            {{ topic }}
          </button>
        }
      </div>

      <!-- Topic Management Buttons -->
      <div class="flex items-center gap-3 mb-6">
        <button (click)="selectAllTopics()" data-agent-id="btn-select-all" class="text-xs font-semibold text-neutral-400 hover:text-teal-400 transition-colors px-2 py-1">Seleccionar Todo</button>
        <div class="h-4 w-px bg-neutral-700"></div>
        <button (click)="clearAllTopics()" data-agent-id="btn-clear-all" class="text-xs font-semibold text-neutral-400 hover:text-rose-400 transition-colors px-2 py-1">Limpiar Selección</button>
      </div>

      <div class="flex flex-col sm:flex-row items-center gap-4 border-t border-neutral-800 pt-6">
        <button 
          (click)="generate()"
          data-agent-id="btn-generate"
          [disabled]="isLoading() || (!isUrl() && customQuery().trim() === '' && selectedTopics().size === 0)"
          [class]="isUrl() ? 'from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-emerald-900/30' : 'from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-teal-900/30'"
          class="relative overflow-hidden w-full inline-flex items-center justify-center px-6 py-4 sm:py-3.5 border border-transparent text-base font-bold rounded-xl text-white bg-gradient-to-r focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-[0.98] group touch-manipulation">
          @if (isLoading()) {
            <div class="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] skew-x-12"></div>
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="relative z-10">Procesando...</span>
          } @else {
            @if (isUrl()) {
               <svg xmlns="http://www.w3.org/2000/svg" class="-ml-1 mr-2 h-5 w-5 relative z-10 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
               </svg>
            } @else {
               <svg xmlns="http://www.w3.org/2000/svg" class="-ml-1 mr-2 h-5 w-5 relative z-10 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
            }
            <span class="relative z-10">{{ searchButtonText() }}</span>
          }
        </button>
        
        <!-- Standard Error Message -->
        @if (error() && !isOverloaded()) {
          <div class="w-full sm:w-auto flex items-center text-red-400 text-sm font-medium bg-red-900/20 px-4 py-3 rounded-xl border border-red-900/50 animate-in fade-in slide-in-from-top-2">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="flex-1">{{ error() }}</span>
          </div>
        }
      </div>
    </section>

    <!-- Permission Denied Warning -->
    @if (isPermissionDenied()) {
      <section class="mb-12 animate-in fade-in duration-700 relative" data-agent-id="permission-denied-view">
        <div class="flex flex-col items-center justify-center text-center p-6 sm:p-8 bg-neutral-900/90 backdrop-blur-md rounded-2xl border border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.15)] max-w-2xl mx-auto">
          <div class="text-5xl mb-4">🔒</div>
          <h3 class="text-2xl font-bold text-red-400 mb-2 font-mono tracking-tight">Servicio de IA no disponible</h3>
          <p class="text-neutral-300 mb-6 font-medium text-base leading-relaxed max-w-md">
            No se pudo conectar con el proveedor de IA gratuito. La app no usa Google ni cobra por las llamadas.
          </p>
          <div class="bg-black/60 rounded-xl p-5 mb-6 border border-neutral-800 text-left w-full max-w-lg">
            <h4 class="text-red-300 font-bold text-sm mb-2">Posibles soluciones:</h4>
            <ol class="list-decimal list-inside text-xs text-neutral-400 space-y-2.5">
              <li>Revisa la conexión a internet y vuelve a intentar.</li>
              <li>Espera unos segundos: la cuota gratuita limita una respuesta cada 30 segundos.</li>
              <li>Opcional: agrega una clave gratis de Groq en <code class="text-red-300">GROQ_API_KEY</code> para más velocidad.</li>
              <li>Opcional: configura Ollama local en <code class="text-red-300">OLLAMA_MODEL</code> para funcionar sin internet.</li>
            </ol>
          </div>
          <button (click)="generate()" data-agent-id="btn-retry-permission" class="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-red-900/50 uppercase tracking-wider text-xs">
            Reintentar Generación
          </button>
        </div>
      </section>
    }

    <!-- Credits Depleted Warning -->
    @if (isCreditsDepleted() && !isPermissionDenied()) {
      <section class="mb-12 animate-in fade-in duration-700 relative" data-agent-id="credits-depleted-view">
        <div class="flex flex-col items-center justify-center text-center p-6 sm:p-8 bg-neutral-900/90 backdrop-blur-md rounded-2xl border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)] max-w-2xl mx-auto">
          <div class="text-5xl mb-4 animate-bounce">⚠️</div>
          <h3 class="text-2xl font-bold text-amber-400 mb-2 font-mono tracking-tight">Cuota gratuita en espera</h3>
          <p class="text-neutral-300 mb-6 font-medium text-base leading-relaxed max-w-md">
            El proveedor gratuito limita una respuesta cada 30 segundos. No hay cobros ni saldo que recargar.
          </p>
          <div class="bg-black/60 rounded-xl p-5 mb-6 border border-neutral-800 text-left w-full max-w-lg">
            <h4 class="text-amber-300 font-bold text-sm mb-2">Qué puedes hacer:</h4>
            <ol class="list-decimal list-inside text-xs text-neutral-400 space-y-2.5">
              <li>Espera 30 segundos y pulsa de nuevo en Reintentar.</li>
              <li>Agrega una clave gratuita de Groq o OpenRouter en <code class="text-amber-300">GROQ_API_KEY</code> / <code class="text-amber-300">OPENROUTER_API_KEY</code> para evitar la espera.</li>
              <li>O instala Ollama en local y define <code class="text-amber-300">OLLAMA_MODEL</code> para uso ilimitado y offline.</li>
            </ol>
          </div>
          <button (click)="generate()" data-agent-id="btn-retry-credits" class="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors shadow-lg shadow-amber-900/50 uppercase tracking-wider text-xs">
            Reintentar Generación
          </button>
        </div>
      </section>
    }

    <!-- Matrix Overload Visual -->
    @if (isOverloaded() && !isCreditsDepleted() && !isPermissionDenied()) {
      <section class="mb-12 animate-in fade-in duration-700 relative group" data-agent-id="overloaded-view">
        <app-matrix-rain class="block shadow-2xl shadow-green-900/20"></app-matrix-rain>
        
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-10">
           <div class="bg-black/70 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-green-500/30 shadow-[0_0_50px_rgba(34,197,94,0.2)] max-w-lg w-full transform transition-all hover:scale-105 duration-500">
              <div class="text-4xl mb-4 animate-bounce">🤖</div>
              <h3 class="text-2xl font-bold text-green-400 mb-2 font-mono tracking-tighter glitch-effect">Lalo: Servicios Saturados</h3>
              <p class="text-green-100/80 mb-6 font-medium text-lg">Estamos procesando todas las noticias posibles, vuelve a intentar.</p>
              
              <button (click)="generate()" data-agent-id="btn-retry" class="px-6 py-2 bg-green-600 hover:bg-green-500 text-black font-bold rounded-lg transition-colors shadow-lg shadow-green-900/50 uppercase tracking-widest text-sm">
                Reintentar Conexión
              </button>
           </div>
        </div>
      </section>
    }

    <!-- Results Section -->
    @if (generatedNews().length > 0 && !isOverloaded() && !isCreditsDepleted() && !isPermissionDenied()) {
      <section class="animate-fade-in pb-8" data-agent-id="results-container">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold text-white flex items-center gap-3">
            <span class="w-1.5 h-6 bg-teal-500 rounded-full"></span>
            Resultados
          </h2>
          <span class="text-xs font-mono text-teal-400 bg-teal-900/30 px-3 py-1.5 rounded-lg border border-teal-900/50">
            {{ generatedNews().length }} ITEMS
          </span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          @for (item of generatedNews(); track $index; let itemIndex = $index) {
            <!-- Card -->
            <article [attr.data-agent-id]="'result-card-' + itemIndex" class="bg-[#111] rounded-2xl shadow-2xl border border-neutral-800 overflow-hidden flex flex-col h-full hover:border-neutral-700 transition-colors duration-300 group">
              <!-- Category Badge & Title -->
              <div class="px-5 py-3.5 border-b border-neutral-800 flex flex-col gap-1.5 bg-neutral-900/40">
                <div class="flex justify-between items-center">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase bg-blue-900/30 text-blue-300 border border-blue-800/50">
                    {{ item.category }}
                  </span>
                  @if (item.sourceUrl) {
                    <a [href]="item.sourceUrl" target="_blank" class="text-xs text-neutral-500 hover:text-teal-400 flex items-center gap-1.5 transition-colors touch-manipulation p-1" title="Ver fuente original">
                      <span class="truncate max-w-[120px] sm:max-w-[150px]">Fuente Verificada</span>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  }
                </div>
                @if (item.title) {
                  <h3 class="text-base font-bold text-white tracking-tight leading-snug">
                    {{ item.title }}
                  </h3>
                }
              </div>

              <!-- Content Area -->
              <div class="p-5 flex-grow flex flex-col gap-6">
                
                <!-- WhatsApp Preview (Feature 1: Versioning & 1-Click Adjustments) -->
                <div class="bg-[#0b141a] p-4 rounded-xl relative border border-neutral-800/50 shadow-inner flex flex-col" style="background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); background-blend-mode: overlay; background-opacity: 0.05;">
                   <div class="flex items-center justify-between mb-2 text-[#e9edef]/60">
                      <div class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.445 0 .062 5.388.062 11.99c0 2.112.553 4.177 1.604 6.038L0 24l6.132-1.61c1.801.981 3.834 1.498 5.908 1.5h.005c6.604 0 11.987-5.388 11.987-11.99 0-3.201-1.243-6.211-3.498-8.468z"/></svg>
                        <span class="text-xs font-bold uppercase tracking-widest text-[#e9edef]">Canal WhatsApp</span>
                      </div>
                      <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700/80 text-neutral-300">
                        {{ getWordCount(getActiveWhatsAppText(item)) }} / 250-350 palabras
                      </span>
                   </div>

                   <!-- Selector de Versiones -->
                   @if (item.versions && item.versions.length > 1) {
                     <div class="flex items-center gap-1.5 mb-2.5 overflow-x-auto pb-1">
                       @for (ver of item.versions; track $index; let vIdx = $index) {
                         <button
                           (click)="selectVersion(itemIndex, vIdx)"
                           [class]="(item.activeVersionIndex ?? 0) === vIdx
                             ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                             : 'bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 border-neutral-700/70'"
                           class="px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all flex items-center gap-1 shrink-0">
                           <span>{{ ver.label }}</span>
                           <span class="text-[10px] opacity-70">({{ ver.wordCount }} pal.)</span>
                         </button>
                       }
                     </div>
                   }

                   <div class="self-start bg-[#202c33] rounded-tr-xl rounded-br-xl rounded-bl-xl p-3.5 max-w-[98%] text-[#e9edef] text-[15px] leading-relaxed shadow-sm relative border border-[#2a3942]">
                      <div class="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-[#202c33] border-l-[10px] border-l-transparent transform rotate-90 z-10"></div>
                      <div class="whitespace-pre-wrap break-words select-text font-whatsapp">{{ getActiveWhatsAppText(item) }}</div>
                      <div class="text-[11px] text-neutral-500 text-right mt-1.5 flex justify-end items-center gap-1">
                        <span>12:45 PM</span>
                        <svg viewBox="0 0 16 15" width="16" height="15" class="text-teal-500 fill-current"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path></svg>
                      </div>
                   </div>

                   <!-- Botones de Ajuste Rápido (1 clic) -->
                   <div class="mt-3 pt-3 border-t border-neutral-800/80 flex flex-col gap-2">
                     <div class="flex items-center justify-between text-[11px]">
                       <span class="font-bold text-neutral-400 flex items-center gap-1.5">
                         <svg class="w-3.5 h-3.5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                         </svg>
                         Ajustar con 1 clic:
                       </span>
                       @if (item.isAdjusting) {
                         <span class="text-teal-400 font-mono flex items-center gap-1">
                           <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                             <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                             <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                           </svg>
                           Generando variante...
                         </span>
                       }
                     </div>

                     <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                       <button
                         [disabled]="item.isAdjusting"
                         (click)="adjustWhatsApp(itemIndex, 'version_b')"
                         title="Versión alternativa con el método hablarle al oído"
                         class="px-2 py-2 bg-neutral-800/90 hover:bg-neutral-700/90 disabled:opacity-40 text-neutral-300 hover:text-white text-[11px] font-medium rounded-lg border border-neutral-700/60 transition-all flex items-center justify-center gap-1 shadow-sm">
                         <span>⚡ Versión B</span>
                       </button>

                       <button
                         [disabled]="item.isAdjusting"
                         (click)="adjustWhatsApp(itemIndex, 'shorter')"
                         title="Ajustar al límite de ~250 palabras"
                         class="px-2 py-2 bg-neutral-800/90 hover:bg-neutral-700/90 disabled:opacity-40 text-neutral-300 hover:text-white text-[11px] font-medium rounded-lg border border-neutral-700/60 transition-all flex items-center justify-center gap-1 shadow-sm">
                         <span>✂️ ~250 pal.</span>
                       </button>

                       <button
                         [disabled]="item.isAdjusting"
                         (click)="adjustWhatsApp(itemIndex, 'new_metaphor')"
                         title="Cambiar la metáfora que sirve a la idea"
                         class="px-2 py-2 bg-neutral-800/90 hover:bg-neutral-700/90 disabled:opacity-40 text-neutral-300 hover:text-white text-[11px] font-medium rounded-lg border border-neutral-700/60 transition-all flex items-center justify-center gap-1 shadow-sm">
                         <span>🔄 Otra metáfora</span>
                       </button>

                       <button
                         [disabled]="item.isAdjusting"
                         (click)="adjustWhatsApp(itemIndex, 'deep_dive_data')"
                         title="Desglosar cifra: qué es, a qué equivale, qué significa y a quién le pega"
                         class="px-2 py-2 bg-neutral-800/90 hover:bg-neutral-700/90 disabled:opacity-40 text-neutral-300 hover:text-white text-[11px] font-medium rounded-lg border border-neutral-700/60 transition-all flex items-center justify-center gap-1 shadow-sm">
                         <span>💡 + Dato duro</span>
                       </button>
                     </div>

                     @if (item.adjustmentError) {
                       <p class="text-rose-400 text-[10px] bg-rose-950/40 p-1.5 rounded border border-rose-800/50 mt-1">{{ item.adjustmentError }}</p>
                     }
                   </div>

                   <button
                     id="btn-copy-wa-{{itemIndex}}"
                     (click)="copyWhatsAppPost(itemIndex)"
                     [class]="copiedButtonId() === ('btn-copy-wa-' + itemIndex)
                       ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                       : 'bg-[#1db954]/10 hover:bg-[#1db954]/20 border-[#1db954]/30 text-[#1db954]'"
                     class="mt-3 w-full border text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                     @if (copiedButtonId() === ('btn-copy-wa-' + itemIndex)) {
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                       </svg>
                       <span class="text-emerald-400 font-bold">¡Copiado para WhatsApp!</span>
                     } @else {
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                       </svg>
                       <span>COPIAR PARA WHATSAPP</span>
                     }
                   </button>
                </div>

                <!-- X (Twitter) Preview -->
                <div class="bg-black p-4 rounded-xl border border-neutral-800 shadow-xl flex flex-col gap-3 relative overflow-hidden">
                   @if (item.isAdjustingTwitter) {
                     <div class="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center z-10 gap-2">
                        <div class="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                        <span class="text-xs text-sky-300 font-medium">Reescribiendo formato para X...</span>
                     </div>
                   }

                   <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-white">
                         <svg viewBox="0 0 24 24" class="h-5 w-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                         <span class="text-xs font-bold uppercase tracking-widest text-[#71767b]">Post para X (Twitter)</span>
                      </div>
                      <span class="text-[10px] bg-sky-950 text-sky-400 border border-sky-800/80 px-2 py-0.5 rounded font-mono">Algoritmo 2026</span>
                   </div>

                   <!-- Versiones de X si existen -->
                   @if (item.twitterVersions && item.twitterVersions.length > 1) {
                     <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
                        @for (ver of item.twitterVersions; track $index) {
                          <button
                            (click)="selectTwitterVersion(itemIndex, $index)"
                            [class]="item.activeTwitterVersionIndex === $index
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/80 font-bold'
                              : 'bg-neutral-900/80 text-neutral-400 border-neutral-800 hover:text-neutral-200'"
                            class="px-2.5 py-1 text-[11px] rounded-lg border transition-all shrink-0 cursor-pointer">
                            {{ ver.label }}
                          </button>
                        }
                     </div>
                   }

                   <div class="text-[15px] leading-relaxed text-white selection:bg-blue-500/30 whitespace-pre-wrap break-words">
                      {{ getActiveTwitterText(item) }}
                   </div>

                   <!-- Quick Format Adjustments Toolbar for X -->
                   <div class="pt-2 border-t border-neutral-900 flex flex-col gap-1.5">
                      <div class="flex items-center justify-between">
                         <span class="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Formato y tono en X:</span>
                         <span class="text-[10px] text-neutral-500">1 clic para adaptar</span>
                      </div>
                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                         <button
                           (click)="adjustTwitter(itemIndex, 'hook_viral')"
                           [disabled]="item.isAdjustingTwitter"
                           title="Gancho inicial demoledor para detener el scroll"
                           class="px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-sky-300 text-[11px] font-medium rounded-lg border border-neutral-800 transition-all flex items-center justify-center gap-1 cursor-pointer">
                           <span>⚡ Gancho Viral</span>
                         </button>
                         <button
                           (click)="adjustTwitter(itemIndex, 'thread')"
                           [disabled]="item.isAdjustingTwitter"
                           title="Formato mini-hilo numerado 1/3, 2/3, 3/3 para mayor retención y guardados"
                           class="px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-sky-300 text-[11px] font-medium rounded-lg border border-neutral-800 transition-all flex items-center justify-center gap-1 cursor-pointer">
                           <span>🧵 Mini-Hilo (1/3)</span>
                         </button>
                         <button
                           (click)="adjustTwitter(itemIndex, 'debate')"
                           [disabled]="item.isAdjustingTwitter"
                           title="Pregunta polémica o dilema para maximizar respuestas (replies >50x likes en el algoritmo)"
                           class="px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-sky-300 text-[11px] font-medium rounded-lg border border-neutral-800 transition-all flex items-center justify-center gap-1 cursor-pointer">
                           <span>💬 Debate</span>
                         </button>
                         <button
                           (click)="adjustTwitter(itemIndex, 'key_takeaways')"
                           [disabled]="item.isAdjustingTwitter"
                           title="3 viñetas limpias con las conclusiones clave para lectura ultra rápida"
                           class="px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-sky-300 text-[11px] font-medium rounded-lg border border-neutral-800 transition-all flex items-center justify-center gap-1 cursor-pointer">
                           <span>📌 3 Claves</span>
                         </button>
                      </div>
                      @if (item.twitterAdjustmentError) {
                        <p class="text-rose-400 text-[10px] bg-rose-950/40 p-1.5 rounded border border-rose-800/50 mt-1">{{ item.twitterAdjustmentError }}</p>
                      }
                   </div>

                   <!-- Hashtags with Live X Trends inserter -->
                   <div class="mt-1 flex flex-col gap-2.5 bg-neutral-900/60 p-3 rounded-xl border border-neutral-800">
                      <div class="flex items-center justify-between">
                         <div class="flex items-center gap-2">
                            <span class="text-[10px] text-neutral-400 font-mono uppercase tracking-wider font-semibold">Hashtags de X:</span>
                            @if (item.hashtags?.includes('#EntendiendoCosas')) {
                               <span class="text-[9px] bg-teal-950 text-teal-300 border border-teal-800/80 px-1.5 py-0.5 rounded font-medium">Oficial</span>
                            }
                            @if (item.hashtags) {
                               <span class="text-[9px] bg-neutral-800 text-neutral-400 border border-neutral-700 px-1.5 py-0.5 rounded font-mono">
                                 {{ countHashtags(item.hashtags) }} tags
                               </span>
                            }
                         </div>
                         <button
                           (click)="toggleTrendSelector(itemIndex)"
                           class="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer">
                           <span>{{ item.showTrendSelector ? '✕ Ocultar Tendencias' : '🔥 + Agregar Tendencia de Hoy' }}</span>
                         </button>
                      </div>

                      <!-- Trending quick picker if opened -->
                      @if (item.showTrendSelector) {
                        <div class="p-2.5 bg-neutral-950/90 rounded-lg border border-sky-800/60 flex flex-col gap-2 animate-in fade-in">
                           <div class="flex items-center justify-between">
                             <span class="text-[11px] text-neutral-300 font-medium">Toca cualquier tendencia para agregar o quitar de esta nota:</span>
                             <span class="text-[10px] text-sky-400 font-mono">Tiempo Real</span>
                           </div>
                           <div class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                              @for (trend of xTrends(); track trend.hashtag) {
                                <button
                                  (click)="toggleTrendInCard(itemIndex, trend.hashtag)"
                                  [title]="isTrendInCard(item, trend.hashtag) ? 'Toca para quitar ' + trend.hashtag : 'Toca para agregar ' + trend.hashtag"
                                  class="text-[11px] px-2.5 py-1 rounded-md border transition-all flex items-center gap-1.5 cursor-pointer select-none"
                                  [class]="isTrendInCard(item, trend.hashtag) 
                                    ? 'bg-sky-500/20 text-sky-200 border-sky-400 font-bold shadow-sm' 
                                    : 'bg-neutral-900 text-neutral-300 border-neutral-700/80 hover:bg-neutral-800 hover:text-white'">
                                  <span>{{ trend.hashtag }}</span>
                                  @if (isTrendInCard(item, trend.hashtag)) {
                                    <span class="text-[10px] text-sky-400 font-bold">✓</span>
                                  } @else {
                                    <span class="text-[10px] text-neutral-500 font-bold">+</span>
                                  }
                                </button>
                              }
                           </div>
                        </div>
                      }

                      <div class="flex items-start justify-between gap-3 pt-1 border-t border-neutral-800/80">
                         <div class="text-sky-400 text-sm font-medium break-words leading-relaxed selection:bg-sky-500/30 flex-1">
                            {{ item.hashtags || 'Sin hashtags' }}
                         </div>
                         <button
                           id="btn-copy-hash-{{itemIndex}}"
                           (click)="copyHashtagsOnly(itemIndex)"
                           title="Copiar únicamente la lista de hashtags"
                           class="text-[11px] text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-750 border border-neutral-700 px-2.5 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1 cursor-pointer">
                           @if (copiedButtonId() === ('btn-copy-hash-' + itemIndex)) {
                             <span class="text-emerald-400 font-bold">✓ Copiados</span>
                           } @else {
                             <span>Copiar hashtags</span>
                           }
                         </button>
                      </div>
                   </div>

                   <!-- Copy Button for X -->
                   <button
                     id="btn-copy-x-{{itemIndex}}"
                     (click)="copyXPost(itemIndex)"
                     [class]="copiedButtonId() === ('btn-copy-x-' + itemIndex)
                       ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                       : 'bg-white/5 hover:bg-white/10 border-neutral-700 text-white hover:border-neutral-500'"
                     class="mt-1 w-full border text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer shadow-sm">
                     @if (copiedButtonId() === ('btn-copy-x-' + itemIndex)) {
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                       </svg>
                       <span class="text-emerald-400 font-bold">¡Post + Hashtags Copiados!</span>
                     } @else {
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                       </svg>
                       <span>Copiar Post + Hashtags</span>
                     }
                   </button>
                </div>

                <!-- Prompt Blocks Section -->
                <div class="grid gap-3">
                   <!-- Image Prompt -->
                   <div class="bg-neutral-900/50 rounded-lg border border-neutral-800 p-3 flex flex-col gap-3 group/prompt">
                      <div class="flex items-center justify-between">
                         <div class="flex items-center gap-2 text-rose-400">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span class="text-xs font-bold tracking-wider uppercase">Prompt de Imagen (4:3)</span>
                         </div>
                         <span class="text-[10px] text-neutral-400 bg-neutral-800/70 border border-neutral-700 px-2 py-0.5 rounded-full font-medium">Solo prompt</span>
                      </div>

                      <p class="text-[11px] text-neutral-400">Copia este prompt y genera la imagen en la herramienta que prefieras (Midjourney, DALL·E, Flux, etc.). La app ya no genera la portada.</p>

                      <!-- Prompt text & copy button -->
                      <div class="pt-2 border-t border-neutral-800/60">
                        <div class="flex items-center justify-between mb-1">
                           <span class="text-[10px] text-neutral-500 uppercase tracking-wide font-mono">Prompt para Midjourney / DALL-E</span>
                           <span class="text-[10px] font-mono flex items-center gap-0.5 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 whitespace-nowrap" title="Marca de agua editorial: 'entendiendocosas.lat' en una sola línea ('entendiendo' en rojo y 'cosas.lat' en negro)">
                             <span class="text-neutral-500 mr-0.5">Marca:</span>
                             <span class="text-[#E34234] font-semibold">entendiendo</span><span class="text-neutral-300 font-semibold">cosas.lat</span>
                           </span>
                        </div>
                        <p 
                          (click)="togglePromptExpansion('img-' + itemIndex)"
                          class="text-xs text-neutral-500 font-code leading-relaxed cursor-pointer transition-all duration-200 hover:text-neutral-300"
                          [class.line-clamp-2]="!isPromptExpanded('img-' + itemIndex)">
                          {{item.imagePrompt}}
                        </p>
                        <button 
                          id="btn-prompt-img-{{itemIndex}}"
                          (click)="copyToClipboard(item.imagePrompt, 'btn-prompt-img-' + itemIndex)"
                          class="w-full mt-2 bg-indigo-900/10 border border-indigo-500/20 hover:bg-indigo-900/30 hover:border-indigo-500/40 text-indigo-300 text-xs font-semibold py-1.5 rounded-md transition-colors flex items-center justify-center gap-2">
                          Copiar Prompt de Imagen
                        </button>
                      </div>
                   </div>

                   <!-- Video Prompt -->
                   <div class="bg-neutral-900/50 rounded-lg border border-neutral-800 p-3 flex flex-col gap-2 group/prompt">
                      <div class="flex items-center justify-between">
                         <div class="flex items-center gap-2 text-rose-400">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span class="text-xs font-bold tracking-wider uppercase">Prompt Video</span>
                         </div>
                         <span class="text-[10px] text-neutral-600">Runway / Pika</span>
                      </div>
                      <p 
                        (click)="togglePromptExpansion('vid-' + itemIndex)"
                        class="text-xs text-neutral-500 font-code leading-relaxed cursor-pointer transition-all duration-200 hover:text-neutral-300"
                        [class.line-clamp-2]="!isPromptExpanded('vid-' + itemIndex)">
                        {{item.videoPrompt}}
                      </p>
                       <button 
                        id="btn-prompt-vid-{{itemIndex}}"
                        (click)="copyToClipboard(item.videoPrompt, 'btn-prompt-vid-' + itemIndex)"
                        class="w-full mt-1 bg-rose-900/10 border border-rose-500/20 hover:bg-rose-900/30 hover:border-rose-500/40 text-rose-300 text-xs font-semibold py-2 rounded-md transition-colors flex items-center justify-center gap-2">
                        Copiar para Video
                      </button>
                   </div>
                </div>

              </div>

              <!-- Actions Footer -->
              <div class="p-4 bg-neutral-900 border-t border-neutral-800">
                <button
                  id="btn-copy-all-{{itemIndex}}"
                  (click)="copyAll(itemIndex)"
                  [class]="copiedButtonId() === ('btn-copy-all-' + itemIndex)
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:text-white'"
                  class="w-full h-12 flex items-center justify-center gap-2.5 px-4 border rounded-xl text-sm font-semibold transition-all shadow-sm touch-manipulation active:scale-95 cursor-pointer">
                  @if (copiedButtonId() === ('btn-copy-all-' + itemIndex)) {
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span class="text-emerald-400 font-bold">¡Todo Copiado! (WhatsApp + X + Hashtags)</span>
                  } @else {
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copiar Todo (WhatsApp + X + Hashtags)</span>
                  }
                </button>
              </div>

            </article>
          }
        </div>
      </section>
    } @else if (!isLoading() && generatedNews().length === 0 && !isOverloaded()) {
      <div class="text-center py-24 px-4 animate-in fade-in zoom-in-95 duration-500" data-agent-id="idle-view">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-neutral-900 mb-6 ring-1 ring-neutral-800 shadow-2xl shadow-neutral-900">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-teal-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 class="text-xl font-bold text-white mb-3">Consola Lista</h3>
        <p class="text-base text-neutral-400 max-w-md mx-auto leading-relaxed">Pega el enlace de una noticia o escribe un tema para comenzar a escanear.</p>
      </div>
    }
  </main>
</div>
  `,
  styles: []
})
export class AppComponent implements OnInit {
  private geminiService = inject(GeminiService);

  // State
  isLoading = signal<boolean>(false);
  generatedNews = signal<NewsItem[]>([]);
  error = signal<string | null>(null);
  isOverloaded = signal<boolean>(false); // New state for 503 errors
  isCreditsDepleted = signal<boolean>(false); // New state for depleted credits
  isPermissionDenied = signal<boolean>(false); // New state for 403 permission errors
  expandedPrompts = signal<Set<string>>(new Set());
  customQuery = signal<string>('');

  // State for X (Twitter) Trends
  xTrends = signal<XTrend[]>(DEFAULT_X_TRENDS);
  isLoadingTrends = signal<boolean>(false);
  autoLinkXTrends = signal<boolean>(true);
  trendFeedbackMessage = signal<string | null>(null);
  copiedButtonId = signal<string | null>(null);

  // Agent State Computed Helpers
  agentOutputJson = computed(() => JSON.stringify(this.generatedNews(), null, 2));
  availableTopicsJson = computed(() => JSON.stringify(this.availableTopics));
  agentStateStr = computed(() => {
    if (this.isLoading()) return 'processing';
    if (this.isPermissionDenied()) return 'permission_denied';
    if (this.isCreditsDepleted()) return 'credits_depleted';
    if (this.isOverloaded()) return 'overloaded';
    if (this.error()) return 'error';
    if (this.generatedNews().length > 0) return 'success';
    return 'idle';
  });

  ngOnInit() {
    // Automatically load fresh X trends in background on start in browser
    if (typeof window !== 'undefined') {
      this.loadXTrends();
    }

    // Check URL parameters for Agent automatic interaction
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryParam = params.get('query');
      const topicsParam = params.get('topics');
      
      let shouldAutoRun = false;
      
      if (queryParam) {
        this.customQuery.set(decodeURIComponent(queryParam));
        shouldAutoRun = true;
      }
      
      if (topicsParam) {
        const decodedTopics = decodeURIComponent(topicsParam).split(',');
        const validTopics = this.availableTopics.filter(t => decodedTopics.includes(t));
        this.selectedTopics.set(new Set(validTopics));
        if (validTopics.length > 0) shouldAutoRun = true;
      }
      
      // Auto-trigger for AI agents running deep-links
      if (shouldAutoRun) {
        // slight delay to let UI render before fetching in browser
        setTimeout(() => this.generate(), 500);
      }
    }
  }

  // Computed State for URL Detection
  isUrl = computed(() => {
    const query = this.customQuery().trim();
    return /^(http|https):\/\/[^ "]+$/.test(query);
  });

  // Dynamic Button Text
  searchButtonText = computed(() => {
    if (this.isLoading()) return 'Procesando...';
    if (this.isUrl()) return 'Analizar Enlace';
    return 'Iniciar Búsqueda';
  });

  // Available Topics
  availableTopics = [
    'Última Hora',
    'China Tech',
    'Estados Unidos Tech',
    'Europa Tech',
    'Latinoamérica Tech',
    'Corea del Sur Tech',
    'Japón Tech',
    'Rusia Tech',
    'Taiwán Tech',
    'Singapur Tech',
    'África Tech',
    'Ciencia',
    'Tecnología',
    'Guerra',
    'Economía',
    'Aranceles',
    'Criptomonedas',
    'México',
    'Estados Unidos',
    'Trump',
    'China',
    'Rusia',
    'Corea del Norte',
    'Irán',
    'Corea del Sur',
    'Japón',
    'OTAN',
    'Europa',
    'Latinoamérica',
    'Narcotráfico',
    'Inteligencia Artificial',
    'Computación Cuántica',
    'Física Cuántica'
  ];

  selectedTopics = signal<Set<string>>(new Set());

  toggleTopic(topic: string) {
    const current = new Set(this.selectedTopics());
    if (current.has(topic)) {
      current.delete(topic);
    } else {
      current.add(topic);
    }
    this.selectedTopics.set(current);
  }

  isTopicSelected(topic: string): boolean {
    return this.selectedTopics().has(topic);
  }
  
  selectAllTopics() {
    this.selectedTopics.set(new Set(this.availableTopics));
  }

  clearAllTopics() {
    this.selectedTopics.set(new Set());
  }

  togglePromptExpansion(key: string) {
    this.expandedPrompts.update(current => {
      const newSet = new Set(current);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  isPromptExpanded(key: string): boolean {
    return this.expandedPrompts().has(key);
  }

  onCustomQueryInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.customQuery.set(target.value);
  }

  async generate() {
    const topics = Array.from(this.selectedTopics());
    const query = this.customQuery().trim();
    
    // Validation: Must have topics OR a query (URL or text)
    if (topics.length === 0 && !query) {
      this.error.set('Por favor selecciona un tema o pega un enlace.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.isOverloaded.set(false); // Reset overloaded state
    this.isCreditsDepleted.set(false); // Reset depleted credits state
    this.isPermissionDenied.set(false); // Reset permission denied state
    this.generatedNews.set([]);

    try {
      const activeTrendsList = this.autoLinkXTrends() 
        ? this.xTrends().map(t => `${t.hashtag} (${t.topic})`)
        : [];
      const rawNews = await this.geminiService.generateNewsContent(topics, query, activeTrendsList);
      const newsWithVersions: NewsItem[] = (rawNews || []).map(item => ({
        ...item,
        versions: [
          {
            label: 'Versión A (Original)',
            whatsappBody: item.whatsappBody,
            wordCount: this.getWordCount(item.whatsappBody)
          }
        ],
        activeVersionIndex: 0,
        twitterVersions: [
          {
            label: 'Original 2026',
            twitterBody: item.twitterBody
          }
        ],
        activeTwitterVersionIndex: 0
      }));
      this.generatedNews.set(newsWithVersions);
    } catch (err: any) {
      console.warn("Aviso al generar noticias:", err?.message || err);
      const errorMessage = (err.message || JSON.stringify(err) || '').toLowerCase();
      
      // Check for 403 Permission Denied or Missing/Invalid API Key
      if (
        errorMessage.includes('permission_denied') ||
        errorMessage.includes('does not have permission') ||
        errorMessage.includes('permissiondenied') ||
        errorMessage.includes('403') ||
        errorMessage.includes('forbidden') ||
        errorMessage.includes('falta la api key') ||
        errorMessage.includes('api key no válida') ||
        errorMessage.includes('api_key_invalid') ||
        errorMessage.includes('api key not valid') ||
        errorMessage.includes('api key')
      ) {
        this.isPermissionDenied.set(true);
        this.error.set(null);
      } else if (
        errorMessage.includes('prepayment') ||
        errorMessage.includes('depleted') ||
        errorMessage.includes('prepay') ||
        errorMessage.includes('billing')
      ) {
        this.isCreditsDepleted.set(true);
      } else if (
        errorMessage.includes('503') || 
        errorMessage.includes('429') || 
        errorMessage.includes('402') ||
        errorMessage.includes('free_limit') ||
        errorMessage.includes('cuota') ||
        errorMessage.includes('overloaded') || 
        errorMessage.includes('unavailable') ||
        errorMessage.includes('too many requests') ||
        errorMessage.includes('resource_exhausted')
      ) {
        this.isOverloaded.set(true);
      } else {
        this.error.set(err.message || 'Ocurrió un error al generar las noticias. Intenta de nuevo.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async copyToClipboard(text: string, id: string): Promise<boolean> {
    let success = false;

    // 1. Try modern navigator.clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText error, attempting textarea fallback:', err);
      }
    }

    // 2. Fallback using temporary textarea (crucial for iframe environments)
    if (!success && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '-9999px';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.error('execCommand copy fallback failed:', err);
      }
    }

    if (id) {
      this.copiedButtonId.set(id);
      setTimeout(() => {
        if (this.copiedButtonId() === id) {
          this.copiedButtonId.set(null);
        }
      }, 2500);
    }

    return success;
  }

  async copyXPost(itemIndex: number) {
    const item = this.generatedNews()[itemIndex];
    if (!item) return;

    const twitterText = (this.getActiveTwitterText(item) || item.twitterBody || '').trim();
    const hashtags = (item.hashtags || '').trim();

    // Clean separation with exactly two newlines: Post body + Blank line + Hashtags
    const fullContent = hashtags ? `${twitterText}\n\n${hashtags}` : twitterText;

    const success = await this.copyToClipboard(fullContent, 'btn-copy-x-' + itemIndex);
    if (success) {
      const tagCount = this.countHashtags(hashtags);
      this.trendFeedbackMessage.set(`✓ Post completo copiado con éxito (${tagCount} hashtags incluidos)`);
      setTimeout(() => {
        this.trendFeedbackMessage.set(null);
      }, 3500);
    }
  }

  async copyHashtagsOnly(itemIndex: number) {
    const item = this.generatedNews()[itemIndex];
    if (!item) return;
    const hashtags = (item.hashtags || '').trim();
    if (!hashtags) return;

    await this.copyToClipboard(hashtags, 'btn-copy-hash-' + itemIndex);
    this.trendFeedbackMessage.set(`✓ Hashtags copiados: ${hashtags}`);
    setTimeout(() => {
      this.trendFeedbackMessage.set(null);
    }, 3000);
  }

  async copyWhatsAppPost(itemIndex: number) {
    const item = this.generatedNews()[itemIndex];
    if (!item) return;
    const waText = this.getActiveWhatsAppText(item);
    await this.copyToClipboard(waText, 'btn-copy-wa-' + itemIndex);
  }

  async copyAll(itemIndex: number) {
    const item = this.generatedNews()[itemIndex];
    if (!item) return;

    const wa = (this.getActiveWhatsAppText(item) || '').trim();
    const tw = (this.getActiveTwitterText(item) || item.twitterBody || '').trim();
    const hash = (item.hashtags || '').trim();

    const sections = [
      `📱 WHATSAPP:\n${wa}`,
      `🐦 X (TWITTER):\n${tw}`,
      hash ? `🏷️ HASHTAGS:\n${hash}` : ''
    ].filter(Boolean).join('\n\n');

    const ok = await this.copyToClipboard(sections, 'btn-copy-all-' + itemIndex);
    if (ok) {
      this.trendFeedbackMessage.set('✓ Todo copiado (WhatsApp + Post X + Hashtags)');
      setTimeout(() => {
        this.trendFeedbackMessage.set(null);
      }, 3000);
    }
  }

  countHashtags(hashtagsStr: string): number {
    if (!hashtagsStr) return 0;
    return hashtagsStr.split(/\s+/).filter(t => t.startsWith('#')).length;
  }

  getWordCount(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  getActiveWhatsAppText(item: NewsItem): string {
    if (item.versions && item.activeVersionIndex !== undefined && item.versions[item.activeVersionIndex]) {
      return item.versions[item.activeVersionIndex].whatsappBody;
    }
    return item.whatsappBody;
  }

  selectVersion(itemIndex: number, versionIndex: number) {
    this.generatedNews.update(items => {
      const updated = [...items];
      const item = { ...updated[itemIndex] };
      item.activeVersionIndex = versionIndex;
      item.whatsappBody = item.versions?.[versionIndex]?.whatsappBody || item.whatsappBody;
      updated[itemIndex] = item;
      return updated;
    });
  }

  async adjustWhatsApp(
    itemIndex: number,
    action: 'version_b' | 'shorter' | 'new_metaphor' | 'deep_dive_data'
  ) {
    const items = this.generatedNews();
    const item = items[itemIndex];
    if (!item || item.isAdjusting) return;

    this.generatedNews.update(list => {
      const copy = [...list];
      copy[itemIndex] = {
        ...copy[itemIndex],
        isAdjusting: true,
        adjustmentError: undefined
      };
      return copy;
    });

    try {
      const currentText = this.getActiveWhatsAppText(item);
      const newText = await this.geminiService.generateAlternativeWhatsAppText(
        currentText,
        action,
        item.category || item.title
      );

      const labelMap: Record<string, string> = {
        version_b: '⚡ Versión B',
        shorter: '✂️ ~250 Palabras',
        new_metaphor: '🔄 Otra Metáfora',
        deep_dive_data: '💡 Desglose Cifra'
      };

      const newVersionLabel = labelMap[action] || 'Variante';
      const wordCount = this.getWordCount(newText);

      this.generatedNews.update(list => {
        const copy = [...list];
        const currentItem = { ...copy[itemIndex] };
        const versions = currentItem.versions ? [...currentItem.versions] : [
          { label: 'Versión A (Original)', whatsappBody: currentItem.whatsappBody, wordCount: this.getWordCount(currentItem.whatsappBody) }
        ];

        const existingIdx = versions.findIndex(v => v.label === newVersionLabel);
        if (existingIdx >= 0) {
          versions[existingIdx] = { label: newVersionLabel, whatsappBody: newText, wordCount };
          currentItem.activeVersionIndex = existingIdx;
        } else {
          versions.push({ label: newVersionLabel, whatsappBody: newText, wordCount });
          currentItem.activeVersionIndex = versions.length - 1;
        }

        currentItem.versions = versions;
        currentItem.whatsappBody = newText;
        currentItem.isAdjusting = false;
        copy[itemIndex] = currentItem;
        return copy;
      });
    } catch (err: any) {
      console.error('Error adjusting WhatsApp text:', err);
      this.generatedNews.update(list => {
        const copy = [...list];
        copy[itemIndex] = {
          ...copy[itemIndex],
          isAdjusting: false,
          adjustmentError: err?.message || 'No se pudo generar el ajuste. Intenta de nuevo.'
        };
        return copy;
      });
    }
  }

  getActiveTwitterText(item: NewsItem): string {
    if (item.twitterVersions && item.activeTwitterVersionIndex !== undefined && item.twitterVersions[item.activeTwitterVersionIndex]) {
      return item.twitterVersions[item.activeTwitterVersionIndex].twitterBody;
    }
    return item.twitterBody;
  }

  selectTwitterVersion(itemIndex: number, versionIndex: number) {
    this.generatedNews.update(items => {
      const updated = [...items];
      const item = { ...updated[itemIndex] };
      item.activeTwitterVersionIndex = versionIndex;
      item.twitterBody = item.twitterVersions?.[versionIndex]?.twitterBody || item.twitterBody;
      updated[itemIndex] = item;
      return updated;
    });
  }

  async adjustTwitter(
    itemIndex: number,
    action: 'hook_viral' | 'thread' | 'debate' | 'key_takeaways'
  ) {
    const items = this.generatedNews();
    const item = items[itemIndex];
    if (!item || item.isAdjustingTwitter) return;

    this.generatedNews.update(list => {
      const copy = [...list];
      copy[itemIndex] = {
        ...copy[itemIndex],
        isAdjustingTwitter: true,
        twitterAdjustmentError: undefined
      };
      return copy;
    });

    try {
      const currentText = this.getActiveTwitterText(item);
      const newText = await this.geminiService.generateAlternativeTwitterText(
        currentText,
        action,
        item.category || item.title
      );

      const labelMap: Record<string, string> = {
        hook_viral: '⚡ Gancho Viral',
        thread: '🧵 Mini-Hilo',
        debate: '💬 Debate',
        key_takeaways: '📌 3 Claves'
      };

      const newVersionLabel = labelMap[action] || 'Variante';

      this.generatedNews.update(list => {
        const copy = [...list];
        const currentItem = { ...copy[itemIndex] };
        const versions = currentItem.twitterVersions ? [...currentItem.twitterVersions] : [
          { label: 'Original 2026', twitterBody: currentItem.twitterBody }
        ];

        const existingIdx = versions.findIndex(v => v.label === newVersionLabel);
        if (existingIdx >= 0) {
          versions[existingIdx] = { label: newVersionLabel, twitterBody: newText };
          currentItem.activeTwitterVersionIndex = existingIdx;
        } else {
          versions.push({ label: newVersionLabel, twitterBody: newText });
          currentItem.activeTwitterVersionIndex = versions.length - 1;
        }

        currentItem.twitterVersions = versions;
        currentItem.twitterBody = newText;
        currentItem.isAdjustingTwitter = false;
        copy[itemIndex] = currentItem;
        return copy;
      });
    } catch (err: any) {
      console.error('Error adjusting Twitter text:', err);
      this.generatedNews.update(list => {
        const copy = [...list];
        copy[itemIndex] = {
          ...copy[itemIndex],
          isAdjustingTwitter: false,
          twitterAdjustmentError: err?.message || 'No se pudo generar el formato para X. Intenta de nuevo.'
        };
        return copy;
      });
    }
  }

  async loadXTrends() {
    this.isLoadingTrends.set(true);
    try {
      const trends = await this.geminiService.fetchXTrends('México');
      if (trends && trends.length > 0) {
        this.xTrends.set(trends);
      }
    } catch (e) {
      console.warn('No se pudieron actualizar tendencias en vivo:', e);
    } finally {
      this.isLoadingTrends.set(false);
    }
  }

  toggleAutoLinkXTrends() {
    this.autoLinkXTrends.update(v => !v);
  }

  toggleTrendSelector(itemIndex: number) {
    this.generatedNews.update(list => {
      const copy = [...list];
      if (copy[itemIndex]) {
        copy[itemIndex] = {
          ...copy[itemIndex],
          showTrendSelector: !copy[itemIndex].showTrendSelector
        };
      }
      return copy;
    });
  }

  isTrendInCard(item: NewsItem, hashtag: string): boolean {
    if (!item?.hashtags || !hashtag) return false;
    const cleanTag = (hashtag.trim().startsWith('#') ? hashtag.trim() : `#${hashtag.trim()}`).toLowerCase();
    const existing = item.hashtags.toLowerCase().split(/\s+/).filter(Boolean);
    return existing.includes(cleanTag);
  }

  toggleTrendInCard(itemIndex: number, hashtag: string) {
    const cleanTag = hashtag.trim().startsWith('#') ? hashtag.trim() : `#${hashtag.trim()}`;

    this.generatedNews.update(list => {
      const copy = [...list];
      const item = copy[itemIndex];
      if (!item) return copy;

      const current = (item.hashtags || '').trim();
      const existingTokens = current.split(/\s+/).filter(Boolean);
      const isAlreadyAdded = existingTokens.some(t => t.toLowerCase() === cleanTag.toLowerCase());

      let updated = '';
      if (isAlreadyAdded) {
        // Remove hashtag
        updated = existingTokens.filter(t => t.toLowerCase() !== cleanTag.toLowerCase()).join(' ');
      } else {
        // Add hashtag before #EntendiendoCosas if present, otherwise append
        if (current.includes('#EntendiendoCosas')) {
          updated = current.replace('#EntendiendoCosas', `${cleanTag} #EntendiendoCosas`);
        } else {
          updated = current ? `${current} ${cleanTag}` : cleanTag;
        }
      }

      copy[itemIndex] = {
        ...item,
        hashtags: updated.trim()
      };
      return copy;
    });

    const currentItem = this.generatedNews()[itemIndex];
    const isNowAdded = this.isTrendInCard(currentItem, cleanTag);
    this.trendFeedbackMessage.set(
      isNowAdded
        ? `✓ Tendencia ${cleanTag} añadida a esta publicación`
        : `Tendencia ${cleanTag} retirada de los hashtags`
    );
    setTimeout(() => {
      this.trendFeedbackMessage.set(null);
    }, 3000);
  }

  appendTrendToCard(itemIndex: number, hashtag: string) {
    this.toggleTrendInCard(itemIndex, hashtag);
  }

  addTrendToAllOrActive(hashtag: string) {
    const cleanTag = hashtag.trim().startsWith('#') ? hashtag.trim() : `#${hashtag.trim()}`;

    if (this.generatedNews().length === 0) {
      this.copyTrend(cleanTag);
      return;
    }

    let addedCount = 0;
    this.generatedNews.update(list => {
      return list.map(item => {
        const current = (item.hashtags || '').trim();
        const existingTokens = current.split(/\s+/).filter(Boolean);
        if (existingTokens.some(t => t.toLowerCase() === cleanTag.toLowerCase())) {
          return item;
        }
        addedCount++;
        let updated = '';
        if (current.includes('#EntendiendoCosas')) {
          updated = current.replace('#EntendiendoCosas', `${cleanTag} #EntendiendoCosas`);
        } else {
          updated = current ? `${current} ${cleanTag}` : cleanTag;
        }
        return {
          ...item,
          hashtags: updated.trim()
        };
      });
    });

    this.trendFeedbackMessage.set(
      addedCount > 0
        ? `✓ Tendencia ${cleanTag} añadida a todas las notas (${this.generatedNews().length})`
        : `El hashtag ${cleanTag} ya está presente en las notas`
    );
    setTimeout(() => {
      this.trendFeedbackMessage.set(null);
    }, 3200);
  }

  async copyTrend(hashtag: string) {
    const cleanTag = hashtag.trim().startsWith('#') ? hashtag.trim() : `#${hashtag.trim()}`;
    await this.copyToClipboard(cleanTag, 'btn-trend-' + cleanTag);
    this.trendFeedbackMessage.set(`✓ Hashtag ${cleanTag} copiado al portapapeles`);
    setTimeout(() => {
      this.trendFeedbackMessage.set(null);
    }, 2500);
  }
}
