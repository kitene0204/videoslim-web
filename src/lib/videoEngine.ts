/**
 * videoEngine.ts — 브라우저 내부에서 100% 로컬로 실행되는 FFmpeg.wasm 압축·변환 엔진
 *
 * 사용자의 동영상 파일은 외부 서버로 단 1바이트도 전송되지 않으며,
 * 브라우저 메모리 안에서 안전하게 압축 및 확장자 변환을 수행합니다.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export type CompressionMode = 'kakao' | 'under_500mb' | 'quality_auto' | 'custom_mb'
export type OutputFormat = 'mp4' | 'mov' | 'mkv' | 'avi' | 'webm'

export interface VideoMetadata {
  name: string
  sizeBytes: number
  sizeMB: number
  durationSec: number
  width: number
  height: number
}

export interface CompressionOutput {
  blob: Blob
  url: string
  fileName: string
  originalSizeMB: number
  compressedSizeMB: number
  savedPercent: number
  usedModeNote: string
}

export const PRESET_OPTIONS: Record<
  CompressionMode,
  { label: string; badge: string; targetMB: number | null; description: string }
> = {
  kakao: {
    label: '카카오톡 전송 기준',
    badge: '300MB 이하',
    targetMB: 290,
    description: '카카오톡 동영상 전송 제한(300MB)에 맞춰 화질을 최대한 선명하게 유지합니다.',
  },
  under_500mb: {
    label: '500MB 이하 맞춤 압축',
    badge: '500MB 이하',
    targetMB: 485,
    description: '500MB 이하 제한이 있는 플랫폼·과제 제출용으로 용량을 정확히 맞춥니다.',
  },
  quality_auto: {
    label: '화질 유지 자동 압축',
    badge: '추천',
    targetMB: null,
    description: '눈으로 보기에 원본과 거의 같은 화질을 지키면서 불필요한 용량만 줄입니다.',
  },
  custom_mb: {
    label: '목표 용량 직접 입력',
    badge: '직접 설정',
    targetMB: null,
    description: '원하는 최대 용량(예: 50MB, 100MB, 200MB)을 직접 입력해 맞출 수 있습니다.',
  },
}

export const FORMAT_OPTIONS: Record<
  OutputFormat,
  {
    label: string
    mime: string
    vcodec: string
    acodec: string
    crf: string
    extraArgs: string[]
  }
> = {
  mp4: {
    label: 'MP4 (가장 추천 · 카톡/모바일/PC 범용)',
    mime: 'video/mp4',
    vcodec: 'libx264',
    acodec: 'aac',
    crf: '24',
    extraArgs: ['-preset', 'veryfast', '-movflags', '+faststart', '-pix_fmt', 'yuv420p'],
  },
  mov: {
    label: 'MOV (애플 맥/아이폰 호환)',
    mime: 'video/quicktime',
    vcodec: 'libx264',
    acodec: 'aac',
    crf: '24',
    extraArgs: ['-preset', 'veryfast', '-movflags', '+faststart', '-pix_fmt', 'yuv420p'],
  },
  mkv: {
    label: 'MKV (고화질 보관용)',
    mime: 'video/x-matroska',
    vcodec: 'libx264',
    acodec: 'aac',
    crf: '23',
    extraArgs: ['-preset', 'veryfast', '-pix_fmt', 'yuv420p'],
  },
  avi: {
    label: 'AVI (구형 기기 및 일반 호환)',
    mime: 'video/x-msvideo',
    vcodec: 'libx264',
    acodec: 'libmp3lame',
    crf: '24',
    extraArgs: ['-preset', 'veryfast', '-pix_fmt', 'yuv420p'],
  },
  webm: {
    label: 'WEBM (웹사이트 업로드 최적화)',
    mime: 'video/webm',
    vcodec: 'libvpx',
    acodec: 'libvorbis',
    crf: '30',
    extraArgs: ['-deadline', 'realtime', '-cpu-used', '4', '-pix_fmt', 'yuv420p'],
  },
}

let ffmpegInstance: FFmpeg | null = null
let isLoaded = false

/**
 * FFmpeg.wasm 엔진을 브라우저에 최초 1회 로드합니다.
 * 싱글스레드 코어를 사용하여 COOP/COEP 제약 없이 모든 브라우저에서 안정적으로 실행됩니다.
 */
export async function loadFFmpegEngine(
  onStatus?: (message: string) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance
  }

  onStatus?.('압축 엔진(FFmpeg.wasm)을 불러오는 중... (최초 1회만 다운로드)')

  const ffmpeg = new FFmpeg()
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  ffmpegInstance = ffmpeg
  isLoaded = true
  return ffmpeg
}

/**
 * 작업 강제 중단 시 FFmpeg 워커를 안전하게 종료하고 초기화합니다.
 */
export function terminateFFmpegEngine(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate()
    } catch {
      // 이미 종료된 경우 무시
    }
  }
  ffmpegInstance = null
  isLoaded = false
}

/**
 * 브라우저 기본 <video> 태그를 이용해 동영상의 재생 시간과 해상도를 빠르게 추출합니다.
 */
export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const finish = (duration: number, width: number, height: number) => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        name: file.name,
        sizeBytes: file.size,
        sizeMB: file.size / (1024 * 1024),
        durationSec: Number.isFinite(duration) && duration > 0 ? duration : 0,
        width: width || 0,
        height: height || 0,
      })
    }

    video.onloadedmetadata = () => {
      finish(video.duration, video.videoWidth, video.videoHeight)
    }

    // 브라우저가 직접 미리보기할 수 없는 확장자(MKV, AVI 등)라도 압축은 가능하도록 기본값 반환
    video.onerror = () => {
      finish(0, 0, 0)
    }

    video.src = objectUrl
  })
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '알 수 없음'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 동영상을 선택한 압축 기준과 확장자로 브라우저 내부에서 직접 변환합니다.
 */
export async function compressVideoInBrowser(params: {
  file: File
  metadata: VideoMetadata
  mode: CompressionMode
  outputFormat: OutputFormat
  customTargetMB?: number
  onProgress: (ratio: number, statusText: string) => void
}): Promise<CompressionOutput> {
  const { file, metadata, mode, outputFormat, customTargetMB, onProgress } = params
  const fmtCfg = FORMAT_OPTIONS[outputFormat]

  const ffmpeg = await loadFFmpegEngine((msg) => onProgress(0.05, msg))

  // FFmpeg 진행률 리스너 연결
  const progressHandler = ({ progress }: { progress: number }) => {
    const safeProgress = Math.min(0.98, Math.max(0.1, 0.1 + progress * 0.88))
    const pct = Math.round(safeProgress * 100)
    onProgress(safeProgress, `고화질 압축 및 ${outputFormat.toUpperCase()} 변환 중... (${pct}%)`)
  }
  ffmpeg.on('progress', progressHandler)

  // 가상 파일 시스템용 안전한 파일명 생성 (특수문자/한글/공백 충돌 방지)
  const inputExtMatch = file.name.match(/\.([a-zA-Z0-9]+)$/)
  const inputExt = inputExtMatch ? inputExtMatch[1].toLowerCase() : 'mp4'
  const virtualInput = `input_video.${inputExt}`
  const virtualOutput = `output_video.${outputFormat}`

  try {
    onProgress(0.08, '동영상 파일을 브라우저 작업 공간으로 불러오는 중...')
    await ffmpeg.writeFile(virtualInput, await fetchFile(file))

    // 목표 용량 계산
    let targetMB: number | null = null
    if (mode === 'kakao') targetMB = PRESET_OPTIONS.kakao.targetMB
    else if (mode === 'under_500mb') targetMB = PRESET_OPTIONS.under_500mb.targetMB
    else if (mode === 'custom_mb' && customTargetMB && customTargetMB > 0) {
      targetMB = customTargetMB
    }

    // 공통 안전 필터: 홀수 해상도 및 10-bit HEVC 오류 방지
    const args: string[] = ['-i', virtualInput, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2']
    let usedModeNote = '화질 유지 자동 압축 (CRF)'

    // 목표 용량이 설정되어 있고, 원본이 목표보다 크며, 재생 시간을 알고 있을 때 비트레이트 정밀 제어
    const shouldLimitBitrate =
      targetMB !== null && metadata.sizeMB > targetMB * 0.96 && metadata.durationSec > 0

    if (shouldLimitBitrate && targetMB !== null) {
      const usableMB = Math.max(1, targetMB * 0.92)
      const totalKbps = (usableMB * 8192) / metadata.durationSec
      const audioKbps = totalKbps < 400 ? 64 : totalKbps < 900 ? 96 : 128
      const videoKbps = Math.max(150, Math.floor(totalKbps - audioKbps))

      args.push(
        '-c:v',
        fmtCfg.vcodec,
        '-b:v',
        `${videoKbps}k`,
        '-maxrate',
        `${Math.round(videoKbps * 1.15)}k`,
        '-bufsize',
        `${Math.round(videoKbps * 2)}k`,
        ...fmtCfg.extraArgs,
        '-c:a',
        fmtCfg.acodec,
        '-b:a',
        `${audioKbps}k`,
        virtualOutput,
      )
      usedModeNote = `목표 용량(${Math.round(targetMB)}MB 이하) 맞춤 화질 최적화 압축`
    } else {
      // 원본이 이미 목표 용량 이하이거나 '화질 유지 자동 압축' 모드인 경우
      args.push('-c:v', fmtCfg.vcodec, '-crf', fmtCfg.crf)
      if (fmtCfg.vcodec === 'libvpx') {
        args.push('-b:v', '0')
      }
      args.push(...fmtCfg.extraArgs, '-c:a', fmtCfg.acodec, '-b:a', '128k', virtualOutput)

      if (targetMB !== null && metadata.sizeMB <= targetMB * 0.96) {
        usedModeNote = `원본(${metadata.sizeMB.toFixed(1)}MB)이 이미 목표(${Math.round(targetMB)}MB) 이하이므로 화질 유지 최적화(CRF)로 변환했습니다.`
      }
    }

    onProgress(0.1, `고화질 압축 및 ${outputFormat.toUpperCase()} 변환 시작...`)
    const exitCode = await ffmpeg.exec(args)
    if (exitCode !== 0) {
      throw new Error('동영상 변환 중 FFmpeg 오류가 발생했습니다. 다른 확장자(MP4)로 시도해 주세요.')
    }

    onProgress(0.99, '변환된 동영상 파일을 준비하는 중...')
    const rawData = await ffmpeg.readFile(virtualOutput)
    const uint8 = rawData instanceof Uint8Array ? new Uint8Array(rawData) : new TextEncoder().encode(rawData)
    const blob = new Blob([uint8.buffer], { type: fmtCfg.mime })
    const url = URL.createObjectURL(blob)

    const baseName = file.name.replace(/\.[^/.]+$/, '')
    const suffix = mode === 'quality_auto' ? 'compressed' : mode
    const fileName = `${baseName}_${suffix}.${outputFormat}`

    const compressedSizeMB = blob.size / (1024 * 1024)
    const savedPercent =
      metadata.sizeMB > 0 ? (1 - compressedSizeMB / metadata.sizeMB) * 100 : 0

    onProgress(1, '변환이 완료되었습니다!')

    return {
      blob,
      url,
      fileName,
      originalSizeMB: metadata.sizeMB,
      compressedSizeMB,
      savedPercent,
      usedModeNote,
    }
  } finally {
    ffmpeg.off('progress', progressHandler)
    // 브라우저 메모리 누수 방지를 위해 임시 파일 즉시 정리
    try {
      await ffmpeg.deleteFile(virtualInput)
    } catch {
      // 무시
    }
    try {
      await ffmpeg.deleteFile(virtualOutput)
    } catch {
      // 무시
    }
  }
}
