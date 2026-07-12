<template>
  <ClientOnly>
    <div class="vfy">
      <div class="vfy-card">
        <div class="vfy-mark">SYS<span class="dot">.</span></div>
        <div class="vfy-sub">{{ $t('verify.subtitle') }}</div>

        <!-- Loading -->
        <template v-if="phase === 'loading'">
          <div class="vfy-spinner" />
        </template>

        <!-- No soul / not logged in -->
        <template v-else-if="phase === 'gate'">
          <h1>{{ $t('verify.login_required') }}<em>.</em></h1>
          <p class="vfy-desc">{{ $t('verify.login_required_desc') }}</p>
          <button class="btn btn-primary btn-lg" @click="goGate">{{ $t('verify.go_to_login') }}</button>
        </template>

        <!-- Invalid / expired -->
        <template v-else-if="phase === 'invalid'">
          <div class="vfy-ic vfy-ic--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
          </div>
          <h1>{{ $t('verify.invalid_challenge') }}<em>.</em></h1>
          <p class="vfy-desc">{{ errorMsg || $t('verify.invalid_challenge_desc') }}</p>
          <button class="btn btn-primary btn-lg" @click="closePage">{{ $t('common.close') }}</button>
        </template>

        <!-- ── ABGESCHLOSSEN / ZUSAMMENFASSUNG ── -->
        <template v-else-if="phase === 'done'">
          <div class="vfy-ic vfy-ic--ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          </div>
          <h1>{{ $t('verify.done') }}<em>.</em></h1>
          <div class="vfy-summary">
            <div v-for="m in completedMethodsList" :key="m" class="vfy-summary-row vfy-summary-row--ok">
              <svg class="vfy-row-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
              <span>{{ METHOD_LABELS[m] || m }}</span>
              <span class="vfy-row-score">+1</span>
            </div>
            <div v-if="walletSigned" class="vfy-summary-row vfy-summary-row--ok">
              <svg class="vfy-row-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
              <span>Wallet{{ walletAddr ? ' ' + walletAddr.slice(0,6) + '…' + walletAddr.slice(-4) : '' }}</span>
              <span class="vfy-row-score">+1</span>
            </div>
            <div v-if="humanVerified" class="vfy-summary-row vfy-summary-row--ok">
              <svg class="vfy-row-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
              <span>{{ $t('verify.blockchain_anchor', { n: humanAnchorCount }) }}</span>
              <span class="vfy-row-score">+1</span>
            </div>
            <div v-if="verifyIs2fa" class="vfy-summary-row vfy-summary-row--meta">
              <svg class="vfy-row-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3"/></svg>
              <span>{{ $t('verify.mobile_2fa') }}</span>
            </div>
          </div>
          <div class="vfy-score-large">{{ $t('verify.score') }} {{ verifyScore }}</div>
          <p class="vfy-desc" style="margin-top:4px;color:var(--accent)">{{ $t('verify.verification_done') }}</p>
          <!-- Human-Check noch nachholbar -->
          <template v-if="!humanVerified">
            <button class="btn btn-primary btn-lg" :disabled="humanChecking" @click="doHumanCheck" style="margin-bottom:4px">
              <span v-if="humanChecking" class="btn-spinner" style="border-color:var(--fg-2);border-top-color:transparent" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
              {{ humanChecking ? $t('verify.checking_blockchain') : $t('verify.no_robot') }}
            </button>
            <p v-if="humanError" class="vfy-err">{{ humanError }}</p>
          </template>
          <button class="btn btn-primary btn-lg" @click="closePage">{{ $t('verify.close_window') }}</button>
        </template>

        <!-- ── SCHRITT ABGESCHLOSSEN (Zwischenstand) ── -->
        <template v-else-if="phase === 'step-done'">
          <div v-if="selectedMethods.length > 1" class="vfy-steps">
            <div
              v-for="m in selectedMethods" :key="m"
              class="vfy-step"
              :class="{
                'vfy-step--done':   completedMethodsList.includes(m),
                'vfy-step--active': pendingMethods[0] === m && !completedMethodsList.includes(m),
              }"
            >
              <span class="vfy-step-dot" />
              <span class="vfy-step-lbl">{{ { fingerprint: $t('verify.step_finger'), face: $t('verify.step_face'), voice: $t('verify.step_voice'), face_hq: $t('verify.step_face'), voice_hq: $t('verify.step_voice') }[m] }}</span>
            </div>
          </div>
          <div class="vfy-ic vfy-ic--ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          </div>
          <h1>{{ METHOD_LABELS[lastStepMethod] }}<em> ✓</em></h1>
          <p class="vfy-desc">{{ $t('verify.continue_with', { score: verifyScore, method: METHOD_LABELS[pendingMethods[0]] }) }}</p>
          <button class="btn btn-primary btn-lg" @click="continueToNext">{{ $t('common.next') }}</button>
          <button class="btn btn-ghost" @click="finalizeEarly">{{ $t('verify.finalize_early', { score: verifyScore }) }}</button>
        </template>

        <!-- ── METHOD CHOOSER (Opt-in, Multi-Select) ── -->
        <template v-else-if="phase === 'choose'">
          <div class="vfy-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
          </div>
          <h1>{{ $t('verify.choose_methods') }}<em>.</em></h1>
          <p class="vfy-desc">{{ $t('verify.choose_methods_desc') }}</p>

          <button class="btn btn-method" :class="{'btn-method--on': selectedMethods.includes('fingerprint')}" @click="toggleMethod('fingerprint')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"/></svg>
            <span class="btn-label">Fingerabdruck / Face ID</span>
            <span class="vfy-check" v-if="selectedMethods.includes('fingerprint')">✓</span>
            <span class="vfy-badge" v-else>+1</span>
          </button>
          <button class="btn btn-method" :class="{'btn-method--on': selectedMethods.includes('face')}" @click="toggleMethod('face')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M11.25 12.75H12m-.375 0H12m.75 0h-.375M6.75 7.5c0-.69.56-1.25 1.25-1.25h8a1.25 1.25 0 0 1 0 2.5h-8A1.25 1.25 0 0 1 6.75 7.5ZM12 3a9 9 0 1 1 0 18A9 9 0 0 1 12 3Z"/></svg>
            <span class="btn-label">{{ $t('verify.method_face') }}</span>
            <span class="vfy-check" v-if="selectedMethods.includes('face')">✓</span>
            <span class="vfy-badge" v-else>+1</span>
          </button>
          <button class="btn btn-method" :class="{'btn-method--on': selectedMethods.includes('voice')}" @click="toggleMethod('voice')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg>
            <span class="btn-label">{{ $t('verify.method_voice') }}</span>
            <span class="vfy-check" v-if="selectedMethods.includes('voice')">✓</span>
            <span class="vfy-badge" v-else>+1</span>
          </button>

          <button
            class="btn btn-primary btn-lg"
            :disabled="selectedMethods.length === 0"
            style="margin-top:16px"
            @click="startVerification"
          >
            {{ selectedMethods.length > 0 ? $t('verify.start_methods', { n: selectedMethods.length, plural: selectedMethods.length > 1 ? 's' : '' }) : $t('verify.choose_methods') }}
          </button>
        </template>

        <!-- ── AKTIVER VERIFIKATIONS-FLOW ── -->
        <template v-else-if="['idle','verifying','capturing','recording','comparing','verified','failed'].includes(phase)">

          <!-- Fortschritts-Schritte (bei mehr als 1 Methode) -->
          <div v-if="selectedMethods.length > 1" class="vfy-steps">
            <div
              v-for="m in selectedMethods" :key="m"
              class="vfy-step"
              :class="{
                'vfy-step--done':    completedMethodsList.includes(m),
                'vfy-step--active':  m === method && !completedMethodsList.includes(m),
                'vfy-step--pending': !completedMethodsList.includes(m) && m !== method,
              }"
            >
              <span class="vfy-step-dot" />
              <span class="vfy-step-lbl">{{ { fingerprint: $t('verify.step_finger'), face: $t('verify.step_face'), voice: $t('verify.step_voice'), face_hq: $t('verify.step_face'), voice_hq: $t('verify.step_voice') }[m] }}</span>
            </div>
          </div>

          <!-- ── FINGERPRINT ── -->
          <template v-if="method === 'fingerprint'">
            <div class="vfy-ic" :class="icClass">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"/></svg>
            </div>
            <h1 v-if="phase === 'idle'">{{ $t('verify.fingerprint') }}<em>.</em></h1>
            <h1 v-else-if="phase === 'verifying'">{{ $t('verify.waiting_biometric') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'verified'">{{ $t('verify.verified') }}<em>.</em></h1>
            <h1 v-else-if="phase === 'failed'">{{ $t('verify.failed') }}<em>.</em></h1>
            <p class="vfy-desc">
              <template v-if="phase === 'idle'">{{ $t('verify.fingerprint_desc') }}</template>
              <template v-else-if="phase === 'verifying'">{{ $t('verify.confirm_biometric') }}</template>
              <template v-else-if="phase === 'verified'">{{ $t('verify.biometric_success') }}</template>
              <template v-else-if="phase === 'failed'">{{ errorMsg || $t('verify.failed_retry') }}</template>
            </p>
            <button v-if="phase === 'idle'" class="btn btn-primary btn-lg" @click="doFingerprint">{{ $t('verify.verify_now') }}</button>
            <button v-else-if="phase === 'failed'" class="btn btn-primary btn-lg" @click="reset">{{ $t('verify.retry') }}</button>
            <button v-if="(phase === 'idle' || phase === 'failed') && completedMethodsList.length > 0" class="btn btn-ghost" @click="finalizeEarly">{{ $t('verify.finalize_early', { score: verifyScore }) }}</button>
          </template>

          <!-- ── FACE (inkl. HQ — gleiche UI, schärferer Server-Check) ── -->
          <template v-else-if="method === 'face' || method === 'face_hq'">
            <template v-if="phase === 'idle' || phase === 'verifying'">
              <div class="vfy-ic" :class="icClass">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M11.25 12.75H12m-.375 0H12m.75 0h-.375M6.75 7.5c0-.69.56-1.25 1.25-1.25h8a1.25 1.25 0 0 1 0 2.5h-8A1.25 1.25 0 0 1 6.75 7.5ZM12 3a9 9 0 1 1 0 18A9 9 0 0 1 12 3Z"/></svg>
              </div>
              <h1>{{ method === 'face_hq' ? $t('verify.method_face_hq') : $t('verify.face') }}<em>.</em></h1>
              <p class="vfy-desc">{{ $t('verify.face_desc') }}</p>
              <button class="btn btn-primary btn-lg" :disabled="phase === 'verifying'" @click="doFace">
                <span v-if="phase === 'verifying'" class="btn-spinner" />
                {{ phase === 'verifying' ? $t('verify.camera_starting') : $t('verify.activate_camera') }}
              </button>
              <button v-if="phase === 'idle' && completedMethodsList.length > 0" class="btn btn-ghost" @click="finalizeEarly">{{ $t('verify.finalize_early', { score: verifyScore }) }}</button>
            </template>
            <template v-else-if="phase === 'capturing'">
              <div class="vfy-cam-wrap">
                <video ref="faceVideo" autoplay playsinline muted class="vfy-cam" />
                <canvas ref="faceCanvas" style="display:none" />
              </div>
              <p class="vfy-desc">{{ $t('verify.hold_face') }}</p>
              <button class="btn btn-primary btn-lg" @click="captureFace">{{ $t('verify.capture') }}</button>
              <button class="btn btn-ghost" @click="stopCamera(); phase = 'idle'">{{ $t('common.cancel') }}</button>
            </template>
            <template v-else-if="phase === 'comparing'">
              <div class="vfy-ic vfy-ic--spin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
              </div>
              <h1>{{ $t('verify.comparing') }}<em>…</em></h1>
              <p class="vfy-desc">{{ $t('verify.analyzing_face') }}</p>
            </template>
            <template v-else-if="phase === 'failed'">
              <div class="vfy-ic vfy-ic--err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></div>
              <h1>{{ $t('verify.no_match') }}<em>.</em></h1>
              <p class="vfy-desc">{{ errorMsg || $t('verify.face_failed') }}</p>
              <button class="btn btn-primary btn-lg" @click="reset">{{ $t('verify.retry') }}</button>
              <button v-if="completedMethodsList.length > 0" class="btn btn-ghost" @click="finalizeEarly">{{ $t('verify.finalize_early', { score: verifyScore }) }}</button>
            </template>
          </template>

          <!-- ── VOICE ── -->
          <template v-else-if="method === 'voice'">
            <div class="vfy-ic" :class="icClass">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg>
            </div>
            <h1 v-if="phase === 'idle'">{{ $t('verify.voice') }}<em>.</em></h1>
            <h1 v-else-if="phase === 'verifying'">{{ $t('verify.loading_audio') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'recording'">{{ $t('verify.recording') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'comparing'">{{ $t('verify.comparing') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'failed'">{{ $t('verify.no_match') }}<em>.</em></h1>
            <p class="vfy-desc">
              <template v-if="phase === 'idle'">{{ $t('verify.voice_desc') }}</template>
              <template v-else-if="phase === 'verifying'">{{ $t('verify.loading_vault_audio') }}</template>
              <template v-else-if="phase === 'recording'">{{ $t('verify.please_speak', { n: recCountdown }) }} <span class="vfy-rec-dot" /></template>
              <template v-else-if="phase === 'comparing'">{{ $t('verify.spectral_analysis') }}</template>
              <template v-else-if="phase === 'failed'">{{ errorMsg || $t('verify.voice_failed', { pct: (voiceScore * 100).toFixed(0) }) }}</template>
            </p>
            <button v-if="phase === 'idle'" class="btn btn-primary btn-lg" @click="doVoice">{{ $t('verify.start_recording') }}</button>
            <button v-else-if="phase === 'failed'" class="btn btn-primary btn-lg" @click="reset">{{ $t('verify.retry') }}</button>
            <button v-if="(phase === 'idle' || phase === 'failed') && completedMethodsList.length > 0" class="btn btn-ghost" @click="finalizeEarly">{{ $t('verify.finalize_early', { score: verifyScore }) }}</button>
          </template>

          <!-- ── VOICE HQ (Code vorlesen — Identität per FFT + Anti-Replay per STT) ── -->
          <template v-else-if="method === 'voice_hq'">
            <div class="vfy-ic" :class="icClass">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg>
            </div>
            <h1 v-if="phase === 'idle'">{{ $t('verify.method_voice_hq') }}<em>.</em></h1>
            <h1 v-else-if="phase === 'verifying'">{{ $t('verify.loading_audio') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'recording'">{{ $t('verify.recording') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'comparing'">{{ $t('verify.comparing') }}<em>…</em></h1>
            <h1 v-else-if="voiceHqPhase === 'checking_replay'">{{ $t('verify.checking_replay') }}<em>…</em></h1>
            <h1 v-else-if="phase === 'failed'">{{ $t('verify.no_match') }}<em>.</em></h1>
            <p class="vfy-desc">
              <template v-if="phase === 'idle'">{{ $t('verify.voice_hq_desc') }}</template>
              <template v-else-if="phase === 'verifying'">{{ $t('verify.loading_vault_audio') }}</template>
              <template v-else-if="phase === 'comparing'">{{ $t('verify.spectral_analysis') }}</template>
              <template v-else-if="phase === 'failed'">{{ errorMsg || $t('verify.voice_failed', { pct: (voiceScore * 100).toFixed(0) }) }}</template>
            </p>
            <div v-if="voiceCode && (phase === 'idle' || phase === 'recording')" class="vfy-code-box">
              <span class="vfy-code-label">{{ phase === 'recording' ? $t('verify.voice_hq_say_code') : $t('verify.voice_hq_code_label') }}</span>
              <span class="vfy-code-digits">{{ voiceCode }}</span>
              <span v-if="phase === 'recording'" class="vfy-desc" style="margin:8px 0 0">{{ $t('verify.please_speak', { n: recCountdown }) }} <span class="vfy-rec-dot" /></span>
            </div>
            <button v-if="phase === 'idle'" class="btn btn-primary btn-lg" @click="doVoiceHq">{{ $t('verify.start_recording') }}</button>
            <button v-else-if="phase === 'failed'" class="btn btn-primary btn-lg" @click="reset">{{ $t('verify.retry') }}</button>
            <button v-if="(phase === 'idle' || phase === 'failed') && completedMethodsList.length > 0" class="btn btn-ghost" @click="finalizeEarly">{{ $t('verify.finalize_early', { score: verifyScore }) }}</button>
          </template>

          <!-- ── Wallet + Human-Check + Fertig (alle Methoden abgeschlossen) ── -->
          <div v-if="phase === 'verified'" class="vfy-extra">
            <div class="vfy-score">Score {{ verifyScore }}{{ verifyIs2fa ? ' · Mobil ✓' : '' }}</div>

            <!-- Wallet -->
            <template v-if="!walletSigned">
              <button
                class="btn btn-primary btn-lg vfy-wallet-btn"
                :disabled="walletPhase === 'connecting' || walletPhase === 'signing'"
                @click="doWalletSign"
              >
                <span v-if="walletPhase === 'connecting' || walletPhase === 'signing'" class="btn-spinner" />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"/></svg>
                {{ walletPhase === 'connecting' ? $t('verify.wallet_connecting') : walletPhase === 'signing' ? $t('verify.wallet_signing') : walletConnected ? $t('verify.wallet_sign') : $t('verify.wallet_connect') }}
              </button>
              <p v-if="walletError" class="vfy-err">{{ walletError }}</p>
            </template>
            <p v-else class="vfy-wallet-ok">✓ {{ walletAddr.slice(0,6) }}…{{ walletAddr.slice(-4) }} · +1 Wallet</p>

            <!-- No-Robot / Blockchain-Anker -->
            <template v-if="!humanVerified">
              <button
                class="btn btn-primary btn-lg vfy-human-btn"
                :disabled="humanChecking"
                @click="doHumanCheck"
              >
                <span v-if="humanChecking" class="btn-spinner" style="border-color:var(--fg-2);border-top-color:transparent" />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
                {{ humanChecking ? $t('verify.checking_blockchain') : $t('verify.no_robot') }}
              </button>
              <p v-if="humanError" class="vfy-err">{{ humanError }}</p>
            </template>
            <p v-else class="vfy-wallet-ok">{{ $t('verify.blockchain_verified', { n: humanAnchorCount }) }}</p>

            <button class="btn btn-primary btn-lg" style="margin-top:8px" @click="lockAndClose">{{ $t('common.done') }}</button>
          </div>

        </template>

        <!-- QR: Desktop → Handy scannen (nicht zeigen wenn per QR-Scan angekommen) -->
        <div v-if="phase === 'idle' && qrDataUrl && !arrivedViaScan" class="vfy-qr">
          <img :src="qrDataUrl" :alt="$t('verify.qr_code_alt')" class="vfy-qr-img" />
          <p class="vfy-qr-hint">{{ $t('verify.scan_with_phone') }}</p>
        </div>

        <div v-if="phase !== 'done'" class="vfy-foot">
          <span class="live-dot" />
          {{ $t('verify.local_node') }}
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useSoulPasskey } from '~/composables/useSoulPasskey.js'
import { useChainAnchor } from '~/composables/useChainAnchor.js'
import QRCode from 'qrcode'

definePageMeta({ layout: false })

const { t } = useI18n()
const route  = useRoute()
const { hasSoul, soulToken } = useSoul()
const { authenticatePasskey } = useSoulPasskey()
const {
  connectWallet,
  isConnected:   walletConnected,
  anchorError:   walletAnchorErr,
  proveIdentity,
  signSimple,
} = useChainAnchor()

const challengeId  = route.query.id || ''
const methodParam  = route.query.m  || ''
const vt           = route.query.vt || ''

// Methoden aus URL parsen (komma-getrennt oder einzeln)
const VALID_METHODS  = ['fingerprint', 'face', 'voice', 'face_hq', 'voice_hq']
const METHOD_LABELS  = computed(() => ({
  fingerprint: t('verify.method_fingerprint'),
  face:        t('verify.method_face'),
  voice:       t('verify.method_voice'),
  face_hq:     t('verify.method_face_hq'),
  voice_hq:    t('verify.method_voice_hq'),
}))
const urlMethods    = methodParam
  ? methodParam.split(',').filter(m => VALID_METHODS.includes(m))
  : []

// State
const selectedMethods      = ref([...urlMethods])   // opt-in Auswahl
const pendingMethods       = ref([])                 // noch ausstehend
const completedMethodsList = ref([])                 // abgeschlossen
const method               = ref('')                 // aktuelle Methode
const phase                = ref('loading')
const arrivedViaScan       = ref(false)
const errorMsg             = ref('')
const qrDataUrl            = ref('')
const faceVideo            = ref(null)
const faceCanvas           = ref(null)
const recCountdown         = ref(3)
const voiceScore           = ref(0)
const voiceCode            = ref('')
const voiceHqPhase         = ref('')  // '' | 'checking_replay' — Zwischenzustand während des Ziffern-Checks
const verifyScore          = ref(0)
const verifyIs2fa          = ref(false)
const walletSigned         = ref(false)
const walletAddr           = ref('')
const walletError          = ref('')
const walletPhase          = ref('idle')
const lastStepMethod       = ref('')
const humanVerified        = ref(false)
const humanChecking        = ref(false)
const humanError           = ref('')
const humanAnchorCount     = ref(0)
let   faceCamStream        = null
let   statusPollTimer      = null
let   clientId             = ''

const icClass = computed(() => ({
  'vfy-ic--ok':   phase.value === 'verified',
  'vfy-ic--err':  phase.value === 'failed',
  'vfy-ic--spin': ['verifying','capturing','recording','comparing'].includes(phase.value),
}))

function authHeaders() {
  const tok = vt ? `vt:${vt}` : soulToken.value
  return { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
}

function goGate()   { window.location.href = `/gate?next=${encodeURIComponent(route.fullPath)}` }
function closePage() {
  if (window.opener) { window.close(); return }
  if (window.history.length > 1) { window.history.back(); return }
  window.location.href = '/connection'
}

function lockAndClose() {
  stopStatusPoll()
  phase.value = 'done'
  // kein window.close() — Nutzer sieht Zusammenfassung und schließt selbst
}

// ── Opt-in Multi-Select ───────────────────────────────────────────────────────
function toggleMethod(m) {
  const i = selectedMethods.value.indexOf(m)
  if (i >= 0) selectedMethods.value.splice(i, 1)
  else selectedMethods.value.push(m)
}

function startVerification() {
  if (selectedMethods.value.length === 0) return
  pendingMethods.value       = [...selectedMethods.value]
  completedMethodsList.value = []
  method.value               = pendingMethods.value[0]
  phase.value                = 'idle'
  generateQr()
}

// ── Frühzeitig abschließen ────────────────────────────────────────────────────
async function finalizeEarly() {
  try {
    const r = await fetch('/api/verify/complete', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ challenge_id: challengeId, finalize: true }),
    })
    const d = await r.json()
    if (typeof d.score === 'number') verifyScore.value = d.score
    verifyIs2fa.value = !!d.is_2fa
  } catch (_) {}
  pendingMethods.value = []
  stopStatusPoll()
  phase.value = 'done'  // direkt zur Zusammenfassung
}

// ── Sequenzieller Flow ────────────────────────────────────────────────────────
async function advanceAfterMethod(ok) {
  if (!ok) { phase.value = 'failed'; return }
  lastStepMethod.value = method.value
  completedMethodsList.value.push(method.value)
  pendingMethods.value = pendingMethods.value.slice(1)
  if (pendingMethods.value.length > 0) {
    phase.value = 'step-done'  // zeigt Zwischenergebnis, Nutzer klickt "Weiter"
  } else {
    phase.value = 'verified'
  }
}

function continueToNext() {
  method.value   = pendingMethods.value[0]
  errorMsg.value = ''
  phase.value    = 'idle'
}

// ── Status-Poll ───────────────────────────────────────────────────────────────
function startStatusPoll() {
  if (statusPollTimer) return
  statusPollTimer = setInterval(async () => {
    if (['done','invalid','gate','loading'].includes(phase.value)) { stopStatusPoll(); return }
    try {
      const r = await fetch(`/api/verify/status?id=${challengeId}`, { headers: authHeaders() })
      if (!r.ok) return
      const st = await r.json()
      // Anderes Gerät hat Challenge übernommen → schließen
      if (st.claimed_by && st.claimed_by !== clientId) {
        stopStatusPoll(); window.close(); return
      }
      // Remote: Wallet-2FA abgeschlossen → Zusammenfassung
      if (st.verified_level === '2fa' && phase.value !== 'done') {
        if (typeof st.score === 'number') verifyScore.value = st.score
        walletSigned.value = true
        if (st.wallet_2fa?.address) walletAddr.value = st.wallet_2fa.address
        if (Array.isArray(st.completed_methods)) completedMethodsList.value = st.completed_methods
        verifyIs2fa.value = !!st.is_2fa
        stopStatusPoll()
        phase.value = 'done'
      }
    } catch (_) {}
  }, 6000)
}

function stopStatusPoll() {
  if (statusPollTimer) { clearInterval(statusPollTimer); statusPollTimer = null }
}

// ── Claim ─────────────────────────────────────────────────────────────────────
async function claimChallenge() {
  try {
    await fetch('/api/verify/claim', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ challenge_id: challengeId, client_id: clientId }),
    })
  } catch (_) {}
}

// ── QR-Code ───────────────────────────────────────────────────────────────────
async function generateQr() {
  try {
    const url = new URL(window.location.href)
    const ms  = selectedMethods.value.length > 0
      ? selectedMethods.value.join(',')
      : (method.value || 'all')
    url.searchParams.set('m', ms)
    qrDataUrl.value = await QRCode.toDataURL(url.toString(), {
      width: 200, margin: 2, errorCorrectionLevel: 'M',
      color: { dark: '#1a1917', light: '#ececec' },
    })
  } catch (_) {}
}

// ── Auth-Init ─────────────────────────────────────────────────────────────────
function detectScanArrival() {
  arrivedViaScan.value = !!(vt && isMobileDevice())
}

async function checkAlreadyVerified() {
  try {
    const r = await fetch(`/api/verify/status?id=${challengeId}`, { headers: authHeaders() })
    if (!r.ok) return false
    const st = await r.json()
    if (st.voice_code) voiceCode.value = st.voice_code

    // Vollständig verifiziert oder teilweise (wallet noch offen)
    if (st.status === 'verified' || st.verified_level) {
      verifyScore.value    = st.score || 0
      verifyIs2fa.value    = !!st.is_2fa
      walletSigned.value   = st.verified_level === '2fa'
      humanVerified.value  = !!st.human_verified
      humanAnchorCount.value = st.human_anchor_count || 0
      // Methoden-State wiederherstellen
      if (Array.isArray(st.completed_methods)) completedMethodsList.value = st.completed_methods
      if (Array.isArray(st.required_methods) && st.required_methods.length > 0) {
        selectedMethods.value = st.required_methods
      } else if (st.method && !selectedMethods.value.includes(st.method)) {
        selectedMethods.value = [st.method]
      }
      if (st.method) method.value = st.method
      phase.value = st.verified_level === '2fa' ? 'done' : 'verified'
      return true
    }

    // Noch pending aber teilweise abgeschlossen → Fluss wieder aufnehmen
    if (Array.isArray(st.completed_methods) && st.completed_methods.length > 0
        && Array.isArray(st.required_methods)) {
      completedMethodsList.value = st.completed_methods
      selectedMethods.value      = st.required_methods
      const remaining = st.required_methods.filter(m => !st.completed_methods.includes(m))
      if (remaining.length > 0) {
        pendingMethods.value = remaining
        method.value         = remaining[0]
        phase.value          = 'idle'
        return true
      }
    }

    if (st.status === 'failed' || st.status === 'expired') {
      errorMsg.value = 'Diese Verifikation ist bereits abgelaufen oder fehlgeschlagen.'
      phase.value    = 'invalid'
      return true
    }
  } catch (_) {}
  return false
}

onMounted(async () => {
  detectScanArrival()
  clientId = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  if (!challengeId || challengeId.length !== 32) {
    errorMsg.value = t('verify.missing_challenge')
    phase.value    = 'invalid'
    return
  }

  if (vt && vt.length === 48) {
    if (await checkAlreadyVerified()) { startStatusPoll(); return }
    if (selectedMethods.value.length > 0) startVerification()
    else phase.value = 'choose'
    startStatusPoll()
    return
  }

  for (let i = 0; i < 15; i++) {
    if (hasSoul.value) break
    await new Promise(r => setTimeout(r, 100))
  }
  if (!hasSoul.value) { phase.value = 'gate'; return }

  if (await checkAlreadyVerified()) { startStatusPoll(); return }
  if (selectedMethods.value.length > 0) startVerification()
  else phase.value = 'choose'
  startStatusPoll()
})

onUnmounted(() => { stopCamera(); stopStatusPoll() })

function reset() {
  errorMsg.value   = ''
  walletError.value = ''
  voiceScore.value = 0
  walletPhase.value = 'idle'
  stopCamera()
  phase.value = 'idle'
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && !/Win/.test(navigator.platform))
}

async function submitResult(verified) {
  try {
    const payload = {
      challenge_id: challengeId,
      method: method.value,
      verified,
      is_2fa: isMobileDevice(),
    }
    // Bei Mehrfach-Auswahl: selected_methods mitschicken damit Server Multi-Method aktiviert
    // (nötig wenn Challenge ohne required_methods erstellt wurde, z.B. via Chooser im UI)
    if (selectedMethods.value.length > 1) {
      payload.selected_methods = selectedMethods.value
    }
    const r = await fetch('/api/verify/complete', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
    })
    const d = await r.json()
    if (typeof d.score === 'number') verifyScore.value = d.score
    verifyIs2fa.value = !!d.is_2fa
  } catch (_) {}
}

// ── Wallet ────────────────────────────────────────────────────────────────────
async function performWalletSign() {
  walletPhase.value = 'signing'
  walletError.value = ''
  try {
    let body
    if (hasSoul.value) {
      const proof = await proveIdentity()
      if (proof) {
        body = { challenge_id: challengeId, identity_proof: proof }
        walletAddr.value = proof.wallet
      } else if (walletAnchorErr.value) throw new Error(walletAnchorErr.value)
    }
    if (!body) {
      const result = await signSimple(`SYS Verify: ${challengeId}`)
      body = { challenge_id: challengeId, signature: result.signature, address: result.address }
      walletAddr.value = result.address
    }
    const r = await fetch('/api/verify/2fa', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
    })
    const d = await r.json()
    if (d.ok || d.cached) {
      walletSigned.value = true
      if (typeof d.score === 'number') verifyScore.value = d.score
      else verifyScore.value = verifyScore.value + 1
      walletPhase.value = 'idle'
      // phase bleibt 'verified' — Nutzer sieht No-Robot + Fertig noch
    } else throw new Error(d.error || 'Wallet-Signatur fehlgeschlagen.')
  } catch (e) {
    walletError.value = e?.message || 'Wallet-Fehler.'
    walletPhase.value = 'idle'
  }
}

watch(walletConnected, (val) => {
  if (val && walletPhase.value === 'connecting') walletPhase.value = 'idle'
})

async function doWalletSign() {
  walletError.value = ''
  if (walletPhase.value !== 'idle') return
  const authTok = vt ? `vt:${vt}` : soulToken.value
  if (!walletConnected.value) {
    walletPhase.value = 'connecting'
    let knownProjectId
    if (vt) {
      try {
        const pr = await fetch('/api/verify/reown', { headers: { Authorization: `Bearer vt:${vt}` } })
        if (pr.ok) { const pd = await pr.json(); knownProjectId = pd.project_id || undefined }
      } catch (_) {}
    }
    await connectWallet(authTok, knownProjectId)
    setTimeout(() => { if (walletPhase.value === 'connecting') walletPhase.value = 'idle' }, 60000)
    return
  }
  await performWalletSign()
}

// ── No-Robot / Blockchain-Human-Check ────────────────────────────────────────
async function doHumanCheck() {
  if (humanChecking.value || humanVerified.value) return
  humanChecking.value = true
  humanError.value    = ''
  try {
    const r = await fetch('/api/verify/human-check', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ challenge_id: challengeId }),
    })
    const d = await r.json()
    if (d.ok && d.verified) {
      humanVerified.value    = true
      humanAnchorCount.value = d.anchor_count || 0
      if (typeof d.score === 'number') verifyScore.value = d.score
      else verifyScore.value = verifyScore.value + 1
    } else {
      humanError.value = d.reason === 'no_blockchain_anchor'
        ? t('verify.no_blockchain_anchor_found')
        : (d.detail || t('verify.blockchain_failed'))
    }
  } catch {
    humanError.value = 'Verbindungsfehler.'
  } finally {
    humanChecking.value = false
  }
}

// ── Fingerprint ───────────────────────────────────────────────────────────────
async function doFingerprint() {
  await claimChallenge()
  phase.value = 'verifying'
  try {
    const prf = await authenticatePasskey()
    const ok  = !!prf
    if (!ok) errorMsg.value = 'Biometrische Verifikation abgelehnt.'
    await submitResult(ok)
    await advanceAfterMethod(ok)
  } catch (e) {
    errorMsg.value = e?.message || 'Verifikation fehlgeschlagen.'
    phase.value = 'failed'
  }
}

// ── Face ──────────────────────────────────────────────────────────────────────
async function doFace() {
  claimChallenge() // fire-and-forget: getUserMedia muss direkt aus User-Gesture kommen
  phase.value = 'verifying'
  try {
    faceCamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    phase.value = 'capturing'  // erst phase setzen, dann nextTick — sonst ist faceVideo noch nicht im DOM
    await nextTick()
    if (faceVideo.value) { faceVideo.value.srcObject = faceCamStream; faceVideo.value.play().catch(() => {}) }
  } catch {
    errorMsg.value = t('verify.camera_unavailable')
    phase.value = 'failed'
  }
}

async function captureFace() {
  if (!faceVideo.value || !faceCanvas.value) return
  const v = faceVideo.value
  faceCanvas.value.width  = v.videoWidth  || 640
  faceCanvas.value.height = v.videoHeight || 480
  faceCanvas.value.getContext('2d').drawImage(v, 0, 0)
  stopCamera()
  phase.value = 'comparing'
  try {
    const b64 = faceCanvas.value.toDataURL('image/jpeg', 0.85).split(',')[1]
    const r   = await fetch('/api/verify/face-check', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ image_base64: b64, mime: 'image/jpeg', hq: method.value === 'face_hq' }),
    })
    const d  = await r.json()
    const ok = d.match === true
    if (!ok) errorMsg.value = d.reason || 'Kein Gesichts-Match.'
    await submitResult(ok)
    await advanceAfterMethod(ok)
  } catch {
    errorMsg.value = 'Vergleich fehlgeschlagen.'
    phase.value = 'failed'
  }
}

function stopCamera() {
  if (faceCamStream) { faceCamStream.getTracks().forEach(t => t.stop()); faceCamStream = null }
}

// ── Voice ─────────────────────────────────────────────────────────────────────
function fftMags(samples) {
  let n = 256; while (n < Math.min(samples.length, 4096)) n <<= 1
  const re = new Float32Array(n), im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = (samples[i] || 0) * (0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))))
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr0 = Math.cos(ang), wi0 = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0
      for (let j = 0; j < (len >> 1); j++) {
        const k = i + j, l = k + (len >> 1), tr = re[l] * wr - im[l] * wi, ti = re[l] * wi + im[l] * wr
        re[l] = re[k] - tr; im[l] = im[k] - ti; re[k] += tr; im[k] += ti
        const nw = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = nw
      }
    }
  }
  const mags = new Float32Array(n >> 1)
  for (let i = 0; i < n >> 1; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i])
  return mags
}

function spectralEnvelope(buf) {
  const s = buf.getChannelData(0), frameSize = 2048, hop = 512
  const env = new Float64Array(frameSize >> 1); let cnt = 0
  for (let start = 0; start + frameSize <= s.length; start += hop, cnt++) {
    const frame = s.slice(start, start + frameSize), mags = fftMags(frame)
    for (let i = 0; i < env.length; i++) env[i] += Math.log1p(mags[i])
  }
  if (cnt > 0) for (let i = 0; i < env.length; i++) env[i] /= cnt
  return env
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na * nb) + 1e-10)
}

function recordAudio(stream, ms) {
  return new Promise((resolve, reject) => {
    const chunks = [], mr = new MediaRecorder(stream)
    mr.ondataavailable = e => e.data.size && chunks.push(e.data)
    mr.onstop = () => {
      const mimeType = mr.mimeType || 'audio/webm'
      new Blob(chunks, { type: mimeType }).arrayBuffer()
        .then(buffer => resolve({ buffer, mimeType }))
        .catch(reject)
    }
    mr.onerror = reject; mr.start(); setTimeout(() => mr.stop(), ms)
  })
}

async function doVoice() {
  claimChallenge() // fire-and-forget: getUserMedia muss direkt aus User-Gesture kommen
  phase.value = 'verifying'; voiceScore.value = 0
  try {
    const listRes  = await fetch('/api/vault/audio', { headers: authHeaders() })
    const listData = await listRes.json()
    const refUrl   = listData.active_url || listData.files?.[0]?.url
    if (!refUrl) throw new Error('Keine Stimme im Vault')
    const refBuf = await fetch(refUrl, { headers: authHeaders() }).then(r => r.arrayBuffer())
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    phase.value = 'recording'; recCountdown.value = 3
    const timer = setInterval(() => { recCountdown.value--; if (recCountdown.value <= 0) clearInterval(timer) }, 1000)
    const { buffer: recBuf } = await recordAudio(stream, 3000)
    clearInterval(timer)
    stream.getTracks().forEach(t => t.stop())
    phase.value = 'comparing'
    const ctx = new AudioContext()
    const [refDecoded, recDecoded] = await Promise.all([ctx.decodeAudioData(refBuf), ctx.decodeAudioData(recBuf)])
    ctx.close()
    const score = cosineSim(spectralEnvelope(refDecoded), spectralEnvelope(recDecoded))
    voiceScore.value = score
    const ok = score > 0.78
    if (!ok) errorMsg.value = `Stimm-Match zu niedrig (${(score * 100).toFixed(0)}%).`
    await submitResult(ok)
    await advanceAfterMethod(ok)
  } catch (e) {
    errorMsg.value = e?.message || 'Stimm-Verifikation fehlgeschlagen.'
    phase.value = 'failed'
  }
}

// ── Voice HQ (Identität weiter per FFT, zusätzlich Anti-Replay per STT) ────────
async function doVoiceHq() {
  claimChallenge()
  phase.value = 'verifying'; voiceScore.value = 0; voiceHqPhase.value = ''
  try {
    const listRes  = await fetch('/api/vault/audio', { headers: authHeaders() })
    const listData = await listRes.json()
    const refUrl   = listData.active_url || listData.files?.[0]?.url
    if (!refUrl) throw new Error('Keine Stimme im Vault')
    const refBuf = await fetch(refUrl, { headers: authHeaders() }).then(r => r.arrayBuffer())
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // 5s statt 3s wie bei "voice" — sechs Ziffern brauchen mehr Zeit als ein Wort.
    phase.value = 'recording'; recCountdown.value = 5
    const timer = setInterval(() => { recCountdown.value--; if (recCountdown.value <= 0) clearInterval(timer) }, 1000)
    const { buffer: recBuf, mimeType } = await recordAudio(stream, 5000)
    clearInterval(timer)
    stream.getTracks().forEach(t => t.stop())
    phase.value = 'comparing'
    const ctx = new AudioContext()
    // .slice(0) für die FFT-Kopie — decodeAudioData neutert den übergebenen
    // ArrayBuffer in manchen Browsern, recBuf wird unten nochmal für den
    // Anti-Replay-Upload gebraucht.
    const [refDecoded, recDecoded] = await Promise.all([
      ctx.decodeAudioData(refBuf), ctx.decodeAudioData(recBuf.slice(0)),
    ])
    ctx.close()
    const score = cosineSim(spectralEnvelope(refDecoded), spectralEnvelope(recDecoded))
    voiceScore.value = score
    const fftOk = score > 0.78

    // Anti-Replay: Aufnahme an den Server schicken, der prüft server-seitig ob
    // der vorgelesene Code tatsächlich in der Transkription vorkommt.
    voiceHqPhase.value = 'checking_replay'
    let digitsOk = false
    try {
      const r = await fetch(`/api/verify/voice-hq-check?challenge_id=${challengeId}`, {
        method:  'POST',
        headers: { Authorization: authHeaders().Authorization, 'Content-Type': mimeType },
        body:    recBuf,
      })
      const d = await r.json()
      digitsOk = d.digits_match === true
    } catch {}
    voiceHqPhase.value = ''

    const ok = fftOk && digitsOk
    if (!ok) {
      errorMsg.value = !fftOk
        ? `Stimm-Match zu niedrig (${(score * 100).toFixed(0)}%).`
        : t('verify.voice_hq_digits_failed')
    }
    await submitResult(ok)
    await advanceAfterMethod(ok)
  } catch (e) {
    errorMsg.value = e?.message || 'Stimm-Verifikation fehlgeschlagen.'
    phase.value = 'failed'
  }
}
</script>

<style scoped>
.vfy {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 24px 16px;
}

.vfy-card {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 40px 32px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.vfy-mark { font-size: 22px; font-weight: 800; letter-spacing: -.5px; color: var(--fg); line-height: 1; }
.vfy-mark .dot { color: var(--accent); }
.vfy-sub { font-size: 12px; color: var(--fg-2); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 12px; }

.vfy-ic {
  width: 64px; height: 64px; border-radius: 50%;
  background: var(--bg); border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  margin: 12px 0; color: var(--fg-2);
  transition: border-color .2s, color .2s;
}
.vfy-ic svg { width: 28px; height: 28px; }
.vfy-ic--ok  { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.vfy-ic--err { border-color: var(--c-err, #e06c75); color: var(--c-err, #e06c75); background: color-mix(in srgb, var(--c-err, #e06c75) 10%, transparent); }
.vfy-ic--spin svg { animation: vfy-spin .9s linear infinite; }
@keyframes vfy-spin { to { transform: rotate(360deg); } }

h1 { font-size: 22px; font-weight: 700; color: var(--fg); margin: 4px 0; line-height: 1.2; }
h1 em { font-style: italic; color: var(--accent-bright, var(--accent)); }
.vfy-desc { font-size: 14px; color: var(--fg); line-height: 1.6; margin: 0 0 16px; max-width: 300px; }

/* Fortschritts-Schritte */
.vfy-steps {
  display: flex; gap: 8px; margin: 8px 0 4px; width: 100%; justify-content: center;
}
.vfy-step {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-size: 11px; color: var(--fg-2); min-width: 56px;
}
.vfy-step-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--border); border: 1.5px solid var(--border);
  transition: background .2s, border-color .2s;
}
.vfy-step--done  .vfy-step-dot { background: var(--accent); border-color: var(--accent); }
.vfy-step--active .vfy-step-dot { background: transparent; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.vfy-step--done  .vfy-step-lbl { color: var(--accent); }
.vfy-step--active .vfy-step-lbl { color: var(--fg); font-weight: 600; }

.btn { width: 100%; margin-top: 4px; border-radius: 10px; font-size: 15px; font-weight: 600; padding: 14px 20px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .15s, opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-lg { padding: 14px 20px; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-bright, var(--accent)); filter: brightness(1.08); }
.btn-ghost { background: transparent; color: var(--fg-2); border: 1px solid var(--border); margin-top: 8px; }
.btn-ghost:hover { color: var(--fg); border-color: var(--fg-3); }
.btn-method { background: var(--bg); color: var(--fg); border: 1px solid var(--border); justify-content: flex-start; gap: 10px; padding: 12px 16px; margin-top: 6px; text-align: left; }
.btn-method:hover { border-color: var(--accent); color: var(--accent); }
.btn-method--on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.btn-icon { width: 18px; height: 18px; flex-shrink: 0; }
.btn-label { flex: 1; }
.btn-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: vfy-spin .7s linear infinite; flex-shrink: 0; }

.vfy-badge { font-size: 10px; font-weight: 600; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); border-radius: 4px; padding: 2px 6px; white-space: nowrap; }
.vfy-check { font-size: 13px; font-weight: 700; color: var(--accent); }

.vfy-cam-wrap { width: 100%; border-radius: 12px; overflow: hidden; background: #000; aspect-ratio: 4/3; margin: 8px 0; }
.vfy-cam { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }

.vfy-rec-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e06c75; animation: vfy-blink 1s ease-in-out infinite; margin-left: 6px; }
@keyframes vfy-blink { 0%,100%{opacity:1} 50%{opacity:.2} }

.vfy-code-box { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 4px 0 16px; padding: 16px; border-radius: 12px; background: var(--bg); border: 1.5px solid var(--border); width: 100%; }
.vfy-code-label { font-size: 11px; color: var(--fg-2); letter-spacing: .08em; text-transform: uppercase; }
.vfy-code-digits { font-size: 30px; font-weight: 800; letter-spacing: .18em; color: var(--fg); font-variant-numeric: tabular-nums; }

.vfy-spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: vfy-spin .8s linear infinite; margin: 24px auto; }

.vfy-extra { width: 100%; margin-top: 12px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.vfy-score { font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: .04em; }
.vfy-score-large { font-size: 15px; font-weight: 700; color: var(--accent); letter-spacing: .04em; margin: 6px 0; }
.vfy-wallet-btn { font-size: 14px; margin-top: 2px; }
.vfy-human-btn  { font-size: 14px; margin-top: 6px; }
.vfy-err { font-size: 12px; color: var(--c-err, #e06c75); margin: 0; }
.vfy-wallet-ok { font-size: 13px; color: var(--accent); margin: 4px 0 0; font-weight: 600; }

.vfy-foot { margin-top: 20px; font-size: 11px; color: var(--fg-2); display: flex; align-items: center; gap: 6px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: vfy-blink 2s ease-in-out infinite; flex-shrink: 0; }

.vfy-qr { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 12px; padding-top: 16px; border-top: 1px solid var(--border); width: 100%; }
.vfy-qr-img { width: 160px; height: 160px; border-radius: 8px; }
.vfy-qr-hint { font-size: 12px; color: var(--fg-2); }

/* Zusammenfassung */
.vfy-summary {
  width: 100%; margin: 12px 0 4px;
  display: flex; flex-direction: column; gap: 6px;
  background: var(--bg); border-radius: 12px;
  padding: 12px 14px;
}
.vfy-summary-row {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; font-weight: 500;
}
.vfy-summary-row--ok  { color: var(--fg); }
.vfy-summary-row--meta { color: var(--fg-2); font-size: 12px; }
.vfy-row-ic { width: 14px; height: 14px; flex-shrink: 0; }
.vfy-summary-row--ok  .vfy-row-ic { color: var(--accent); }
.vfy-summary-row--meta .vfy-row-ic { color: var(--fg-2); }
.vfy-row-score {
  margin-left: auto; font-size: 11px; font-weight: 700;
  color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 4px; padding: 1px 5px;
}
</style>
