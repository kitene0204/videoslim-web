import { useRef, useState } from 'react'
import {
  CheckCircle2,
  Download,
  Film,
  FolderUp,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  AlertCircle,
} from 'lucide-react'
import {
  FORMAT_OPTIONS,
  PRESET_OPTIONS,
  compressVideoInBrowser,
  formatDuration,
  readVideoMetadata,
  terminateFFmpegEngine,
  type CompressionMode,
  type CompressionOutput,
  type OutputFormat,
  type VideoMetadata,
} from './lib/videoEngine'

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [mode, setMode] = useState<CompressionMode>('kakao')
  const [customMB, setCustomMB] = useState<string>('100')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp4')

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState(
    '준비 완료 — 동영상을 끌어다 놓거나 선택해 주세요.',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompressionOutput | null>(null)

  // 이전 결과 ObjectURL 메모리 정리
  const clearResult = () => {
    if (result?.url) {
      URL.revokeObjectURL(result.url)
    }
    setResult(null)
  }

  const handleFileSelected = async (file: File) => {
    if (isProcessing) return
    clearResult()
    setErrorMessage(null)
    setProgress(0)
    setSelectedFile(file)
    setStatusMessage('동영상 정보를 분석하는 중...')

    const info = await readVideoMetadata(file)
    setMetadata(info)
    setStatusMessage('영상 분석 완료! 원하는 압축 기준과 확장자를 선택해 주세요.')
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isProcessing) return

    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      void handleFileSelected(dropped)
    }
  }

  const handleStartCompression = async () => {
    if (!selectedFile || !metadata) {
      setErrorMessage('먼저 1단계에서 동영상 파일을 선택하거나 끌어다 놓아 주세요.')
      return
    }

    let parsedCustomMB: number | undefined
    if (mode === 'custom_mb') {
      parsedCustomMB = Number(customMB)
      if (!Number.isFinite(parsedCustomMB) || parsedCustomMB < 1) {
        setErrorMessage('목표 용량은 1 이상의 숫자로 입력해 주세요. (예: 50, 100, 250)')
        return
      }
    }

    clearResult()
    setErrorMessage(null)
    setIsProcessing(true)
    setProgress(0.02)
    setStatusMessage('변환을 준비하는 중...')

    try {
      const output = await compressVideoInBrowser({
        file: selectedFile,
        metadata,
        mode,
        outputFormat,
        customTargetMB: parsedCustomMB,
        onProgress: (ratio, msg) => {
          setProgress(ratio)
          setStatusMessage(msg)
        },
      })
      setResult(output)
      setProgress(1)
      setStatusMessage(`완료! ${output.fileName} 파일이 준비되었습니다.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      setErrorMessage(msg)
      setProgress(0)
      setStatusMessage('변환 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    if (!isProcessing) return
    terminateFFmpegEngine()
    setIsProcessing(false)
    setProgress(0)
    setStatusMessage('변환 작업이 중단되었습니다.')
  }

  const handleReset = () => {
    if (isProcessing) return
    clearResult()
    setSelectedFile(null)
    setMetadata(null)
    setErrorMessage(null)
    setProgress(0)
    setStatusMessage('준비 완료 — 동영상을 끌어다 놓거나 선택해 주세요.')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* 상단 헤더 */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/icon.png"
              alt="VideoSlim 아이콘"
              className="h-12 w-12 rounded-2xl shadow-lg shadow-sky-500/20"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">VideoSlim</h1>
              <p className="text-sm text-slate-400">
                화질은 선명하게, 용량은 가볍게 · 동영상 압축 & 확장자 변환기
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 sm:self-center">
            <Lock className="h-3.5 w-3.5" />
            <span>100% 브라우저 로컬 처리 · 서버 업로드 없음</span>
          </div>
        </header>

        {/* 1단계: 동영상 선택 & 드래그 앤 드롭 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-400">
                1
              </span>
              동영상 파일 선택
            </h2>
            {selectedFile && !isProcessing && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                초기화
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mkv,.avi,.mov,.webm,.mp4,.wmv,.flv,.m4v"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFileSelected(file)
            }}
          />

          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              if (!isProcessing) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-7 text-center transition ${
              isDragging
                ? 'border-sky-400 bg-sky-500/10'
                : selectedFile
                  ? 'border-emerald-500/50 bg-slate-800/60 hover:border-emerald-400'
                  : 'border-slate-700 bg-slate-800/40 hover:border-sky-500/70 hover:bg-slate-800/70'
            } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
          >
            {selectedFile && metadata ? (
              <div className="space-y-2">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <Film className="h-6 w-6" />
                </div>
                <p className="break-all text-sm font-bold text-white">{metadata.name}</p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-sky-300">
                  <span className="rounded-md bg-slate-900/80 px-2.5 py-1">
                    원본 용량: {metadata.sizeMB.toFixed(2)} MB
                  </span>
                  <span className="rounded-md bg-slate-900/80 px-2.5 py-1">
                    재생 시간: {formatDuration(metadata.durationSec)}
                  </span>
                  {metadata.width > 0 && (
                    <span className="rounded-md bg-slate-900/80 px-2.5 py-1">
                      해상도: {metadata.width} × {metadata.height}
                    </span>
                  )}
                </div>
                <p className="pt-1 text-xs text-slate-400">
                  다른 영상으로 바꾸려면 클릭하거나 새 파일을 끌어다 놓으세요
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 transition group-hover:scale-105">
                  <FolderUp className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  동영상을 여기에 끌어다 놓거나(드래그 앤 드롭) 클릭해 선택하세요
                </p>
                <p className="text-xs text-slate-400">
                  MP4, MOV, MKV, AVI, WEBM 등 모든 주요 동영상 지원
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 2단계: 압축 기준 선택 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl backdrop-blur">
          <h2 className="mb-3.5 flex items-center gap-2 text-base font-bold text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-400">
              2
            </span>
            용량 압축 기준 선택
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(PRESET_OPTIONS) as CompressionMode[]).map((key) => {
              const opt = PRESET_OPTIONS[key]
              const active = mode === key
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setMode(key)}
                  className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                    active
                      ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-800/50'
                  } disabled:opacity-60`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{opt.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        active
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {opt.description}
                  </p>
                </button>
              )
            })}
          </div>

          {mode === 'custom_mb' && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-sky-500/30 bg-slate-950/70 p-3.5">
              <Sliders className="h-4 w-4 text-sky-400" />
              <label htmlFor="custom-mb" className="text-sm font-semibold text-slate-200">
                목표 용량:
              </label>
              <input
                id="custom-mb"
                type="number"
                min={1}
                step={1}
                disabled={isProcessing}
                value={customMB}
                onChange={(e) => setCustomMB(e.target.value)}
                className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-bold text-white outline-none focus:border-sky-500"
              />
              <span className="text-sm text-slate-400">MB 이하</span>
            </div>
          )}
        </section>

        {/* 3단계: 확장자 변환 선택 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl backdrop-blur">
          <h2 className="mb-3.5 flex items-center gap-2 text-base font-bold text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-400">
              3
            </span>
            변환할 동영상 확장자
          </h2>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {(Object.keys(FORMAT_OPTIONS) as OutputFormat[]).map((ext) => {
              const active = outputFormat === ext
              return (
                <button
                  key={ext}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setOutputFormat(ext)}
                  className={`rounded-xl border py-2.5 text-center text-sm font-bold uppercase transition ${
                    active
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700 hover:bg-slate-800/50'
                  } disabled:opacity-60`}
                >
                  .{ext}
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 text-xs text-slate-400">
            선택됨: <span className="font-medium text-slate-200">{FORMAT_OPTIONS[outputFormat].label}</span>
          </p>
        </section>

        {/* 실행 버튼 및 진행률 */}
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl backdrop-blur">
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!selectedFile || isProcessing}
              onClick={() => void handleStartCompression()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-6 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-5 w-5" />
              <span>{isProcessing ? '압축 및 변환 진행 중...' : '압축 및 변환 시작'}</span>
            </button>

            {isProcessing && (
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-5 py-3.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/25"
              >
                <Square className="h-4 w-4 fill-current" />
                중단
              </button>
            )}
          </div>

          {/* 진행 상태 바 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">{statusMessage}</span>
              <span className="font-bold text-sky-400">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>

          {/* 오류 메시지 */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-sm text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 완료 결과 카드 */}
          {result && (
            <div className="space-y-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>압축 및 변환 완료!</span>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {result.originalSizeMB.toFixed(2)} MB →{' '}
                    <span className="text-emerald-300">
                      {result.compressedSizeMB.toFixed(2)} MB
                    </span>{' '}
                    <span className="text-xs font-normal text-slate-300">
                      (
                      {result.savedPercent >= 0
                        ? `${result.savedPercent.toFixed(1)}% 용량 절감`
                        : `확장자 변환 완료`}
                      )
                    </span>
                  </p>
                  <p className="text-xs text-slate-300">{result.usedModeNote}</p>
                </div>

                <a
                  href={result.url}
                  download={result.fileName}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md transition hover:bg-emerald-300"
                >
                  <Download className="h-4 w-4" />
                  <span>변환 파일 다운로드</span>
                </a>
              </div>

              {(outputFormat === 'mp4' || outputFormat === 'webm' || outputFormat === 'mov') && (
                <div className="overflow-hidden rounded-lg border border-slate-800 bg-black">
                  <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-400">
                    <Play className="h-3 w-3 text-emerald-400" />
                    <span>결과 영상 미리보기 ({result.fileName})</span>
                  </div>
                  <video src={result.url} controls className="max-h-72 w-full" />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Windows 데스크톱 버전 다운로드 배너 */}
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-white">
              💻 1GB 이상 대용량 영상이신가요? Windows 데스크톱 버전(.exe)
            </p>
            <p className="text-xs text-slate-400">
              설치 없이 압축만 풀고 바로 실행! 2-Pass 초고화질 압축으로 대용량 영상도 빠르게 처리합니다.
            </p>
          </div>
          <a
            href="https://github.com/kitene0204/videoslim-web/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/25"
          >
            <Download className="h-4 w-4" />
            <span>Windows 앱 다운로드</span>
          </a>
        </section>

        {/* 하단 보안 & 안내 푸터 */}
        <footer className="flex flex-col items-center gap-1.5 pb-6 text-center text-xs text-slate-500">
          <div className="inline-flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>
              모든 영상은 사용자의 기기 안에서만 처리되며 외부 서버로 전송·저장되지 않습니다.
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
