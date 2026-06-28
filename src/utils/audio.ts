let audioCtx: AudioContext | null = null;
let alarmInterval: any = null;

// Global parameters for active tracking
let globalDistance: number = 500;
let globalClickCount: number = 0;
let globalAlertType: 'danger' | 'attention' = 'danger';
let currentLevel: 'light' | 'medium' | 'strong' | null = null;

/**
 * Inicializa o contexto de áudio em resposta a uma interação do utilizador
 */
export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * Calcula os parâmetros de áudio e vibração com base na distância e contagem de cliques
 */
function getAlarmSettings(distance: number, clickCount: number, alertType: 'danger' | 'attention' = 'danger') {
  // Volume multiplier based on clicking the stop button
  // 1º clique: reduzir volume (para 40% da intensidade original)
  // 2º clique: reduzir mais (para 10% da intensidade original)
  // 3º clique: parar som completamente (0% de volume)
  let volumeMultiplier = 1.0;
  if (clickCount === 1) {
    volumeMultiplier = 0.4;
  } else if (clickCount === 2) {
    volumeMultiplier = 0.1;
  } else if (clickCount >= 3) {
    volumeMultiplier = 0.0;
  }

  // If it's an attention-only warning (bridge is low, but higher than the van)
  if (alertType === 'attention') {
    return {
      level: 'light' as const,
      intervalTime: 4000, // Very slow repeating chime (every 4 seconds)
      startFreq: 880,     // A5, pleasant gentle chime pitch
      endFreq: 880,
      volume: 0.08 * volumeMultiplier,
      vibratePattern: [40], // Single very brief pulse
    };
  }

  // Determine intensity level
  // Acima de 300m: alerta leve.
  // Entre 300m e 100m: alerta médio.
  // Abaixo de 100m: alerta forte/urgente.
  let level: 'light' | 'medium' | 'strong' = 'medium';
  let intervalTime = 700; // ms
  let startFreq = 700;   // Hz
  let endFreq = 400;     // Hz
  let baseVolume = 0.35;
  let vibratePattern: number[] = [150, 100];

  if (distance > 300) {
    level = 'light';
    intervalTime = 1200; // slower beeping
    startFreq = 450;     // lower frequency, less alarming
    endFreq = 450;       // steady
    baseVolume = 0.15;   // quieter
    vibratePattern = [80]; // short light vibration
  } else if (distance < 100) {
    level = 'strong';
    intervalTime = 300;  // rapid urgent beeps
    startFreq = 1100;    // sharp high-pitch sound
    endFreq = 650;
    baseVolume = 0.65;   // loud
    vibratePattern = [300, 100, 300]; // heavy vibration
  }

  return {
    level,
    intervalTime,
    startFreq,
    endFreq,
    volume: baseVolume * volumeMultiplier,
    vibratePattern,
  };
}

/**
 * Toca o bip único correspondente às definições de proximidade
 */
function playSingleBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const settings = getAlarmSettings(globalDistance, globalClickCount, globalAlertType);
    
    // If volume is 0 (fully silenced), don't play anything
    if (settings.volume <= 0) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Sawtooth for high audibility in truck cabins
    osc.type = 'sawtooth';
    
    // Frequency Sweep
    osc.frequency.setValueAtTime(settings.startFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(settings.endFreq, audioCtx.currentTime + (settings.intervalTime / 1000) * 0.7);

    // Gain / Volume envelope
    gain.gain.setValueAtTime(settings.volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + (settings.intervalTime / 1000) * 0.9);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + (settings.intervalTime / 1000) * 0.95);

    // Trigger proportionate vibration
    if ('vibrate' in navigator && settings.vibratePattern.length > 0) {
      navigator.vibrate(settings.vibratePattern);
    }
  } catch (error) {
    console.error('Error playing dynamic beep:', error);
  }
}

/**
 * Agenda ou reagenda o loop de alarmes com base na distância e cliques atuais
 */
function rescheduleAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }

  const settings = getAlarmSettings(globalDistance, globalClickCount, globalAlertType);
  
  // If fully muted, do not schedule further beeps
  if (settings.volume <= 0) return;

  // Run initial beep
  playSingleBeep();

  // Schedule loop at dynamic speed
  alarmInterval = setInterval(() => {
    playSingleBeep();
  }, settings.intervalTime);
}

/**
 * Inicia ou atualiza as propriedades do alarme sonoro em tempo real.
 * @param distance Distância atual da ponte em metros
 * @param clickCount Número de vezes que o motorista pressionou silenciar
 * @param alertType Nível de risco do alerta ('danger' ou 'attention')
 * @param isMuted Se o som global está mutado/suspenso
 */
export function playAlarm(
  distance: number = 500,
  clickCount: number = 0,
  alertType: 'danger' | 'attention' = 'danger',
  isMuted: boolean = false
) {
  if (isMuted) {
    stopAlarm();
    return;
  }

  const previousLevel = currentLevel;
  const previousClickCount = globalClickCount;
  const previousAlertType = globalAlertType;

  globalDistance = distance;
  globalClickCount = clickCount;
  globalAlertType = alertType;

  const settings = getAlarmSettings(distance, clickCount, alertType);
  currentLevel = settings.level;

  // Trigger reschedule if level changes (beeping rate), if click count dampens volume,
  // if alert type changes, or if the alarm is not yet active
  if (!alarmInterval || previousLevel !== settings.level || previousClickCount !== clickCount || previousAlertType !== alertType) {
    rescheduleAlarm();
  }
}

/**
 * Para a reprodução do alarme sonoro e reseta estados globais
 */
export function stopAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  currentLevel = null;
  globalClickCount = 0;
}

/**
 * Vibra o telemóvel se suportado com vibração padrão
 */
export function triggerVibration() {
  if ('vibrate' in navigator) {
    navigator.vibrate([400, 150, 400]);
  }
}
