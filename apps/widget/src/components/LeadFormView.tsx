import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { submitLead, unlockTryOn, trackEvent, verifyOtp, resendOtp } from '../utils/api';
import { Sparkles, Loader, AlertCircle, Lock, ChevronDown, Check, ArrowLeft, Key } from 'lucide-react';

interface CountryOption {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

const COUNTRIES: CountryOption[] = [
  { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
];

const LeadFormView: React.FC = () => {
  const {
    jobId,
    previewImageUrl,
    unlockToken,
    config,
    status,
    setStatus,
    otpSessionId,
    maskedPhone,
    expiresAt,
    resendAfter,
    setOtpSession,
    setResult,
  } = useStore();

  // ── Retrieve dynamic configuration and copy ──────────────────────────────
  const leadConfig = config?.leadCapture;
  const title = leadConfig?.title || 'Unlock Your Styling';
  const subtitle = leadConfig?.subtitle || 'Enter your details below to reveal the original high-resolution styling.';
  const buttonText = leadConfig?.buttonText || 'Unlock High-Res Image';
  const successMessage = leadConfig?.successMessage || 'Preparing your high-resolution image...';
  
  // Replace {{brandName}} placeholder dynamically in consent message if present
  const consentText = (leadConfig?.consentText || 'I agree to receive personalized updates and styling offers from {{brandName}}.')
    .replace(/\{\{\s*brandName\s*\}\}/g, config?.name || 'this brand');

  // Dynamic fields configured by merchant (default to legacy name and phone)
  const fields = leadConfig?.fields || [
    { id: 'name', type: 'text', label: 'Full Name', required: true },
    { id: 'phone', type: 'phone', label: 'Mobile Number', required: true }
  ];

  // ── Form State (preserved on submission/unlock errors) ─────────────────────
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRIES[0]);
  const [consent, setConsent] = useState(false);

  // OTP Verification state
  const [otpCode, setOtpCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // UI state
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Auto Submit & Analytics ─────────────────────────────────────────────
  const hasAutoSubmitted = useRef(false);

  useEffect(() => {
    if (status === 'awaiting_lead') {
      const autoSubmit = async () => {
        if (hasAutoSubmitted.current) return;
        
        const stored = localStorage.getItem('vt_lead_verified');
        if (stored) {
          try {
            const data = JSON.parse(stored);
            const isWithin24h = Date.now() - data.verifiedAt < 24 * 60 * 60 * 1000;
            if (isWithin24h && jobId && unlockToken) {
              hasAutoSubmitted.current = true;
              setStatus('sending_otp');
              
              const metadata: Record<string, string> = {};
              fields.forEach((field) => {
                if (field.id !== 'name' && field.id !== 'phone') {
                  metadata[field.id] = data.metadata?.[field.id] || '';
                }
              });

              const leadRes = await submitLead(
                jobId,
                data.name,
                data.phone,
                data.countryCode,
                true,
                metadata
              );

              if (leadRes?.otpRequired) {
                setOtpSession({
                  otpSessionId: leadRes.otpSessionId,
                  expiresAt: leadRes.expiresAt,
                  resendAfter: leadRes.resendAfter,
                  maskedPhone: leadRes.maskedPhone,
                });
                return;
              }

              setStatus('unlocking');
              const unlockRes = await unlockTryOn(leadRes?.unlockToken || unlockToken);
              setResult({
                image: unlockRes.imageUrl,
                compliment: unlockRes.compliment || 'Your style fits perfectly!',
                score: unlockRes.styleScore || 9.0,
              });
              return;
            } else {
               localStorage.removeItem('vt_lead_verified');
            }
          } catch (err) {
            console.error('Auto-submit failed', err);
            setStatus('awaiting_lead');
          }
        }
        trackEvent('lead_form_opened', { jobId });
      };

      autoSubmit();
    }
  }, [jobId, status, fields, unlockToken, setOtpSession, setResult, setStatus]);

  const saveVerifiedState = () => {
    const cleanPhone = phone.replace(/[\s\-()]/g, '');
    const verifiedData = {
      phone: cleanPhone,
      name: formValues['name'] || '',
      countryCode: selectedCountry.dial,
      metadata: formValues,
      verifiedAt: Date.now()
    };
    localStorage.setItem('vt_lead_verified', JSON.stringify(verifiedData));
  };

  // ── OTP Resend Cooldown Countdown ─────────────────────────────────────────
  useEffect(() => {
    if (status === 'awaiting_otp' && resendAfter) {
      setCooldown(resendAfter);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [status, resendAfter, expiresAt]);

  // ── Input change helper ───────────────────────────────────────────────────
  const handleInputChange = (fieldId: string, val: string) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  // ── Validation logic (driven by dynamic configuration) ────────────────────
  const validateLeadForm = (): boolean => {
    setValidationError(null);

    for (const field of fields) {
      const isRequired = field.required === true;
      const label = field.label || field.id;

      if (field.type === 'phone' || field.id === 'phone') {
        if (isRequired && !phone.trim()) {
          setValidationError(`${label} is required.`);
          return false;
        }
        if (phone.trim()) {
          const cleanPhone = phone.replace(/[\s\-()]/g, '');
          if (!/^\d{4,15}$/.test(cleanPhone)) {
            setValidationError(`Please enter a valid format for ${label} (digits only).`);
            return false;
          }
        }
      } else {
        const val = (formValues[field.id] || '').trim();
        if (isRequired && !val) {
          setValidationError(`${label} is required.`);
          return false;
        }
      }
    }

    if (!consent) {
      setValidationError('You must accept marketing consent to unlock.');
      return false;
    }

    return true;
  };

  // ── Screen 1 Lead Submission ──────────────────────────────────────────────
  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !unlockToken) return;

    if (!validateLeadForm()) {
      trackEvent('lead_form_validation_failed', { jobId });
      return;
    }

    setSubmitError(null);
    setStatus('sending_otp');
    trackEvent('lead_form_submitted', { jobId });

    try {
      const cleanPhone = phone.replace(/[\s\-()]/g, '');
      const customerName = formValues['name'] || '';

      const metadata: Record<string, string> = {};
      fields.forEach((field) => {
        if (field.id !== 'name' && field.id !== 'phone') {
          metadata[field.id] = formValues[field.id] || '';
        }
      });

      const leadRes = await submitLead(
        jobId,
        customerName.trim(),
        cleanPhone,
        selectedCountry.dial,
        consent,
        metadata
      );

      if (leadRes?.otpRequired) {
        // Transition to OTP screen
        setOtpSession({
          otpSessionId: leadRes.otpSessionId,
          expiresAt: leadRes.expiresAt,
          resendAfter: leadRes.resendAfter,
          maskedPhone: leadRes.maskedPhone,
        });
      } else {
        // Direct unlock if OTP not required
        saveVerifiedState();
        setStatus('unlocking');
        trackEvent('unlock_started', { jobId });
        const unlockRes = await unlockTryOn(leadRes?.unlockToken || unlockToken);
        trackEvent('unlock_success', { jobId });
        setResult({
          image: unlockRes.imageUrl,
          compliment: unlockRes.compliment || 'Your style fits perfectly!',
          score: unlockRes.styleScore || 9.0,
        });
      }
    } catch (err: any) {
      console.error('Lead submission failed:', err);
      setSubmitError(err.message || 'Network error occurred. Please try again.');
      setStatus('awaiting_lead');
      trackEvent('lead_form_failed', { jobId, error: err.message });
    }
  };

  // ── Screen 2 OTP Resend ───────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (!otpSessionId || cooldown > 0) return;

    setSubmitError(null);
    setStatus('sending_otp');
    trackEvent('otp_resend', { jobId });

    try {
      const res = await resendOtp(otpSessionId);
      setOtpSession({
        otpSessionId,
        expiresAt: res.expiresAt,
        resendAfter: res.resendAfter,
        maskedPhone: maskedPhone || '',
      });
    } catch (err: any) {
      console.error('OTP resend failed:', err);
      setSubmitError(err.message || 'Failed to resend code.');
      setStatus('awaiting_otp');
    }
  };

  // ── Screen 2 OTP Verification ─────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSessionId || !otpCode.trim()) return;

    setValidationError(null);
    setSubmitError(null);

    const otpConfig = leadConfig?.otpVerification;
    const otpLength = otpConfig?.otpLength || 6;
    if (otpCode.length !== otpLength) {
      setValidationError(`Please enter a valid ${otpLength}-digit code.`);
      return;
    }

    setStatus('verifying_otp');
    trackEvent('otp_verified', { jobId });

    try {
      const verifyRes = await verifyOtp(otpSessionId, otpCode.trim());
      
      if (verifyRes.sessionToken) {
        localStorage.setItem(`vt_trust_token_${tenantId}`, verifyRes.sessionToken);
      }

      // Successfully verified, update status to unlocking and resolve original image
      saveVerifiedState();
      setStatus('unlocking');
      trackEvent('unlock_started', { jobId });
      
      const unlockRes = await unlockTryOn(verifyRes.unlockToken);
      trackEvent('unlock_success', { jobId });
      
      setResult({
        image: unlockRes.imageUrl,
        compliment: unlockRes.compliment || 'Your style fits perfectly!',
        score: unlockRes.styleScore || 9.0,
      });
    } catch (err: any) {
      console.error('Verification failed:', err);
      setSubmitError(err.message || 'OTP verification failed. Please try again.');
      setStatus('awaiting_otp');
      trackEvent('otp_failed', { jobId, error: err.message });
    }
  };

  const primaryColor = config?.primaryColor || '#FF5A5F';

  // ── Render Dynamic Input Fields ──────────────────────────────────────────
  const renderField = (field: any) => {
    const label = field.label || field.id;
    const placeholder = field.placeholder || `Enter your ${label.toLowerCase()}`;
    const isRequired = field.required === true;

    if (field.type === 'phone' || field.id === 'phone') {
      return (
        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(245,245,245,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label} {isRequired && <span style={{ color: primaryColor }}>*</span>}
          </label>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            {/* Country Selector */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '12px 12px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 16 }}>{selectedCountry.flag}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(245,245,245,0.8)' }}>{selectedCountry.dial}</span>
                <ChevronDown style={{ width: 14, height: 14, color: 'rgba(245,245,245,0.4)' }} />
              </button>

              <AnimatePresence>
                {countryDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      left: 0,
                      zIndex: 100,
                      background: '#12141a',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      width: 220,
                      maxHeight: 180,
                      overflowY: 'auto',
                    }}
                  >
                    {COUNTRIES.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => {
                          setSelectedCountry(country);
                          setCountryDropdownOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          fontSize: 13,
                          textAlign: 'left',
                          cursor: 'pointer',
                          width: '100%',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <span>{country.flag}</span>
                        <span style={{ fontWeight: 600 }}>{country.dial}</span>
                        <span style={{ fontSize: 11, color: 'rgba(245,245,245,0.4)' }}>{country.name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile number input */}
            <input
              type="tel"
              placeholder={placeholder}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const isChecked = formValues[field.id] === 'true';
      return (
        <div key={field.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => handleInputChange(field.id, isChecked ? 'false' : 'true')}
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: isChecked ? primaryColor : 'rgba(255,255,255,0.04)',
              border: `1.5px solid ${isChecked ? primaryColor : 'rgba(255,255,255,0.18)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isChecked && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
          </button>
          <span style={{ fontSize: 13, color: 'rgba(245,245,245,0.8)' }}>
            {label} {isRequired && <span style={{ color: primaryColor }}>*</span>}
          </span>
        </div>
      );
    }

    return (
      <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(245,245,245,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label} {isRequired && <span style={{ color: primaryColor }}>*</span>}
        </label>
        <input
          type={field.type === 'birthday' ? 'date' : field.type === 'email' ? 'email' : 'text'}
          placeholder={placeholder}
          value={formValues[field.id] || ''}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff',
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => (e.target.style.borderColor = primaryColor)}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
        />
      </div>
    );
  };

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0c10',
      overflow: 'hidden',
    }}>
      {/* Blurred background preview of the try-on result */}
      {previewImageUrl && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${previewImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(35px) brightness(0.28)',
          transform: 'scale(1.15)',
          zIndex: 1,
          pointerEvents: 'none',
        }} />
      )}

      {/* Main Form Overlay */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px 28px',
        overflowY: 'auto',
      }}>
        <AnimatePresence mode="wait">
          {/* ── Status Loaders ────────────────────────────────────────────────── */}
          {status === 'sending_otp' || status === 'verifying_otp' || status === 'unlocking' ? (
            <motion.div
              key={status}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <div style={{
                position: 'relative',
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <Loader
                  style={{
                    width: 32,
                    height: 32,
                    color: primaryColor,
                    animation: 'spin 1.2s linear infinite',
                  }}
                />
              </div>

              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#fff' }}>
                {status === 'sending_otp'
                  ? 'Sending Verification Code...'
                  : status === 'verifying_otp'
                  ? 'Verifying Code...'
                  : 'Phone Verified!'}
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(245,245,245,0.6)', maxWidth: 260, lineHeight: 1.6 }}>
                {status === 'sending_otp'
                  ? 'We are generating a secure OTP to verify your WhatsApp number.'
                  : status === 'verifying_otp'
                  ? 'Confirming verification code with security services.'
                  : successMessage}
              </p>
            </motion.div>
          ) : status === 'awaiting_otp' ? (
            /* ── Screen 2: OTP Verification Screen ────────────────────────────── */
            <motion.form
              key="otp-verification-screen"
              onSubmit={handleVerifyOtp}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 12,
                }}>
                  <Key style={{ width: 12, height: 12, color: primaryColor }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,245,245,0.7)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Verify WhatsApp</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>Enter Verification Code</h2>
                <p style={{ fontSize: 13, color: 'rgba(245,245,245,0.55)', lineHeight: 1.5 }}>
                  We've sent a verification code to <span style={{ color: '#fff', fontWeight: 600 }}>{maskedPhone}</span>
                </p>
              </div>

              {/* Error messages */}
              {(validationError || submitError) && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    marginBottom: 18,
                  }}
                >
                  <AlertCircle style={{ width: 16, height: 16, color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.4 }}>
                    {validationError || submitError}
                  </span>
                </motion.div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {/* OTP Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(245,245,245,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Verification Code
                  </label>
                  <input
                    type="text"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="Enter Code"
                    maxLength={config?.leadCapture?.otpVerification?.otpLength || 6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                      padding: '14px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: '0.3em',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = primaryColor)}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  />
                </div>
              </div>

              {/* Actions bar */}
              <div style={{ display: 'flex', gap: 12, width: '100%', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setStatus('awaiting_lead')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '12px 0',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  Back
                </button>

                <button
                  type="button"
                  disabled={cooldown > 0}
                  onClick={handleResendOtp}
                  style={{
                    flex: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px 0',
                    borderRadius: 12,
                    background: cooldown > 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: cooldown > 0 ? 'rgba(245,245,245,0.4)' : '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: cooldown > 0 ? 'default' : 'pointer',
                  }}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                </button>
              </div>

              {/* Verify CTA */}
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: `0 8px 24px ${primaryColor}40` }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '14px 0',
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${primaryColor}, #7C3AED)`,
                  border: 'none',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  boxShadow: `0 4px 16px ${primaryColor}20`,
                }}
              >
                <Sparkles style={{ width: 16, height: 16 }} />
                Verify WhatsApp
              </motion.button>
            </motion.form>
          ) : (
            /* ── Screen 1: Lead Capture Form Screen ────────────────────────────── */
            <motion.form
              key="lead-capture-form-screen"
              onSubmit={handleLeadSubmit}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
              }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 12,
                }}>
                  <Lock style={{ width: 12, height: 12, color: primaryColor }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,245,245,0.7)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Locked Preview</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>{title}</h2>
                <p style={{ fontSize: 13, color: 'rgba(245,245,245,0.55)', lineHeight: 1.5 }}>{subtitle}</p>
              </div>

              {/* Validation/Submit Errors */}
              {(validationError || submitError) && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    marginBottom: 18,
                  }}
                >
                  <AlertCircle style={{ width: 16, height: 16, color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.4 }}>
                    {validationError || submitError}
                  </span>
                </motion.div>
              )}

              {/* Dynamic Inputs container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {fields.map((field: any) => renderField(field))}
              </div>

              {/* Consent check */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 22 }}>
                <button
                  type="button"
                  onClick={() => setConsent(!consent)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: consent ? primaryColor : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${consent ? primaryColor : 'rgba(255,255,255,0.18)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginTop: 1,
                    transition: 'background-color 0.2s, border-color 0.2s',
                  }}
                >
                  {consent && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span
                    onClick={() => setConsent(!consent)}
                    style={{ fontSize: 12, color: 'rgba(245,245,245,0.7)', cursor: 'pointer', userSelect: 'none', lineHeight: 1.4 }}
                  >
                    {consentText}
                  </span>
                  <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'rgba(245,245,245,0.4)' }}>
                    <a href="/privacy-policy" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>
                    <span>•</span>
                    <a href="/terms-of-service" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms of Service</a>
                  </div>
                </div>
              </div>

              {/* Submit CTA */}
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: `0 8px 24px ${primaryColor}40` }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '14px 0',
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${primaryColor}, #7C3AED)`,
                  border: 'none',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  boxShadow: `0 4px 16px ${primaryColor}20`,
                }}
              >
                <Sparkles style={{ width: 16, height: 16 }} />
                {buttonText}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LeadFormView;
