// ── VISUAL GENERATORS (SVG inline art per model) ──────────────
const visuals = {
  // --- NLP / text models ---
  clinicalBert: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="v1a" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f4f8f2"/><stop offset="100%" stop-color="#f1f6ef"/></linearGradient>
      <filter id="glow1"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="320" height="180" fill="url(#v1a)"/>
    <!-- EHR lines -->
    <g opacity="0.3">
      <rect x="20" y="30" width="180" height="3" rx="2" fill="#2e9e63"/>
      <rect x="20" y="42" width="120" height="3" rx="2" fill="#2f8f6a"/>
      <rect x="20" y="54" width="150" height="3" rx="2" fill="#2e9e63" opacity="0.5"/>
      <rect x="20" y="66" width="90" height="3" rx="2" fill="#5b97c4"/>
      <rect x="20" y="78" width="160" height="3" rx="2" fill="#2f8f6a" opacity="0.5"/>
    </g>
    <!-- Token highlight boxes -->
    <rect x="20" y="100" width="52" height="20" rx="4" fill="rgba(46,158,99,0.15)" stroke="#2e9e63" stroke-width="1"/>
    <rect x="78" y="100" width="68" height="20" rx="4" fill="rgba(91,151,196,0.15)" stroke="#5b97c4" stroke-width="1"/>
    <rect x="152" y="100" width="44" height="20" rx="4" fill="rgba(47,143,106,0.15)" stroke="#2f8f6a" stroke-width="1"/>
    <rect x="202" y="100" width="58" height="20" rx="4" fill="rgba(46,158,99,0.15)" stroke="#2e9e63" stroke-width="1"/>
    <text x="46" y="114" font-size="9" fill="#2e9e63" text-anchor="middle" font-family="monospace">Patient</text>
    <text x="112" y="114" font-size="9" fill="#5b97c4" text-anchor="middle" font-family="monospace">hypertension</text>
    <text x="174" y="114" font-size="9" fill="#2f8f6a" text-anchor="middle" font-family="monospace">10mg</text>
    <text x="231" y="114" font-size="9" fill="#2e9e63" text-anchor="middle" font-family="monospace">aspirin</text>
    <!-- BERT logo area -->
    <circle cx="275" cy="55" r="30" fill="rgba(47,143,106,0.1)" stroke="#2f8f6a" stroke-width="1" stroke-dasharray="4 2"/>
    <text x="275" y="50" font-size="11" fill="#2f8f6a" text-anchor="middle" font-family="monospace" font-weight="bold">BERT</text>
    <text x="275" y="65" font-size="8" fill="#8a978c" text-anchor="middle" font-family="monospace">Clinical</text>
    <!-- Connection lines -->
    <line x1="20" y1="140" x2="280" y2="140" stroke="#d6e0d1" stroke-width="1"/>
    <circle cx="60" cy="155" r="4" fill="#2e9e63" opacity="0.7"/>
    <circle cx="100" cy="150" r="4" fill="#5b97c4" opacity="0.7"/>
    <circle cx="140" cy="158" r="4" fill="#2f8f6a" opacity="0.7"/>
    <circle cx="180" cy="148" r="4" fill="#2e9e63" opacity="0.7"/>
    <circle cx="220" cy="155" r="4" fill="#5b97c4" opacity="0.7"/>
    <polyline points="60,155 100,150 140,158 180,148 220,155" fill="none" stroke="#2e9e63" stroke-width="1.5" opacity="0.4"/>
  </svg>`,

  brainMri: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="brainGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></radialGradient>
      <filter id="brainGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="320" height="180" fill="url(#brainGrad)"/>
    <!-- MRI scan lines -->
    <g opacity="0.2">
      <rect x="0" y="20" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="35" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="50" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="65" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="80" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="95" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="110" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="125" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="140" width="320" height="1" fill="#2f8f6a"/>
      <rect x="0" y="155" width="320" height="1" fill="#2f8f6a"/>
    </g>
    <!-- Brain outline (simplified) -->
    <ellipse cx="160" cy="85" rx="80" ry="70" fill="none" stroke="#8a78c6" stroke-width="1.5" opacity="0.6" filter="url(#brainGlow)"/>
    <!-- Brain folds -->
    <path d="M100 60 Q130 45 160 55 Q190 45 220 60" fill="none" stroke="#8a78c6" stroke-width="1.5" opacity="0.8"/>
    <path d="M95 80 Q125 65 160 75 Q195 65 225 80" fill="none" stroke="#8a78c6" stroke-width="1.5" opacity="0.6"/>
    <path d="M100 100 Q130 90 160 95 Q190 90 220 100" fill="none" stroke="#8a78c6" stroke-width="1.5" opacity="0.6"/>
    <!-- Activation hotspot -->
    <circle cx="145" cy="75" r="18" fill="rgba(91,151,196,0.2)" stroke="#5b97c4" stroke-width="1.5"/>
    <circle cx="145" cy="75" r="9" fill="rgba(91,151,196,0.4)" stroke="#5b97c4" stroke-width="1"/>
    <circle cx="145" cy="75" r="3" fill="#5b97c4"/>
    <!-- Labels -->
    <text x="260" y="45" font-size="8" fill="#8a978c" font-family="monospace">T2-FLAIR</text>
    <text x="260" y="58" font-size="8" fill="#8a78c6" font-family="monospace">Brain</text>
    <text x="262" y="170" font-size="8" fill="#5b97c4" font-family="monospace">Lesion ↗</text>
  </svg>`,

  dnaHelix: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dnaGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#dnaGrad)"/>
    <!-- DNA helix strands -->
    <g transform="translate(160,10)">
      <!-- Left strand -->
      <path d="M-30,0 C-30,20 30,30 30,50 C30,70 -30,80 -30,100 C-30,120 30,130 30,150 C30,160 0,165 0,165" fill="none" stroke="#2e9e63" stroke-width="2" opacity="0.8"/>
      <!-- Right strand -->
      <path d="M30,0 C30,20 -30,30 -30,50 C-30,70 30,80 30,100 C30,120 -30,130 -30,150 C-30,160 0,165 0,165" fill="none" stroke="#2f8f6a" stroke-width="2" opacity="0.8"/>
      <!-- Base pairs -->
      <line x1="-22" y1="12" x2="22" y2="12" stroke="#5b97c4" stroke-width="1.5" opacity="0.9"/>
      <line x1="-28" y1="28" x2="28" y2="28" stroke="#cf9a37" stroke-width="1.5" opacity="0.9"/>
      <line x1="-22" y1="44" x2="22" y2="44" stroke="#2e9e63" stroke-width="1.5" opacity="0.9"/>
      <line x1="-28" y1="60" x2="28" y2="60" stroke="#5b97c4" stroke-width="1.5" opacity="0.9"/>
      <line x1="-22" y1="76" x2="22" y2="76" stroke="#2f8f6a" stroke-width="1.5" opacity="0.9"/>
      <line x1="-28" y1="92" x2="28" y2="92" stroke="#cf9a37" stroke-width="1.5" opacity="0.9"/>
      <line x1="-22" y1="108" x2="22" y2="108" stroke="#2e9e63" stroke-width="1.5" opacity="0.9"/>
      <line x1="-28" y1="124" x2="28" y2="124" stroke="#5b97c4" stroke-width="1.5" opacity="0.9"/>
      <line x1="-22" y1="140" x2="22" y2="140" stroke="#2f8f6a" stroke-width="1.5" opacity="0.9"/>
      <!-- Base circles -->
      <circle cx="-22" cy="12" r="3" fill="#5b97c4"/><circle cx="22" cy="12" r="3" fill="#5b97c4"/>
      <circle cx="-22" cy="44" r="3" fill="#2e9e63"/><circle cx="22" cy="44" r="3" fill="#2e9e63"/>
      <circle cx="-22" cy="76" r="3" fill="#2f8f6a"/><circle cx="22" cy="76" r="3" fill="#2f8f6a"/>
    </g>
    <!-- Labels -->
    <text x="220" y="40" font-size="9" fill="#2e9e63" font-family="monospace">A·T</text>
    <text x="220" y="70" font-size="9" fill="#5b97c4" font-family="monospace">G·C</text>
    <text x="220" y="100" font-size="9" fill="#2f8f6a" font-family="monospace">T·A</text>
    <text x="30" y="170" font-size="8" fill="#8a978c" font-family="monospace">ESM-2 • Protein Language Model</text>
  </svg>`,

  xrayLung: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="xrayGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#xrayGrad)"/>
    <!-- X-ray background texture -->
    <rect width="320" height="180" fill="rgba(255,255,255,0.02)"/>
    <!-- Ribcage -->
    <g fill="none" stroke="rgba(109,223,120,0.3)" stroke-width="1">
      <path d="M100,30 Q80,50 85,80 Q90,100 110,110"/>
      <path d="M220,30 Q240,50 235,80 Q230,100 210,110"/>
      <path d="M105,45 Q75,60 78,90"/>
      <path d="M215,45 Q245,60 242,90"/>
      <path d="M108,60 Q72,72 75,100"/>
      <path d="M212,60 Q248,72 245,100"/>
    </g>
    <!-- Spine -->
    <rect x="155" y="20" width="10" height="140" rx="2" fill="rgba(109,223,120,0.15)"/>
    <!-- Left lung -->
    <path d="M90,40 Q70,60 72,100 Q75,130 100,140 Q125,145 130,130 Q135,115 130,80 Q125,55 110,40 Z" fill="rgba(74,157,81,0.08)" stroke="rgba(74,157,81,0.4)" stroke-width="1.5"/>
    <!-- Right lung -->
    <path d="M230,40 Q250,60 248,100 Q245,130 220,140 Q195,145 190,130 Q185,115 190,80 Q195,55 210,40 Z" fill="rgba(74,157,81,0.08)" stroke="rgba(74,157,81,0.4)" stroke-width="1.5"/>
    <!-- Nodule detection box -->
    <rect x="185" y="70" width="28" height="28" fill="none" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="3 2"/>
    <circle cx="199" cy="84" r="6" fill="rgba(91,151,196,0.3)" stroke="#5b97c4" stroke-width="1"/>
    <text x="220" y="68" font-size="8" fill="#5b97c4" font-family="monospace">NODULE</text>
    <text x="220" y="79" font-size="8" fill="#5b97c4" font-family="monospace">0.87</text>
    <!-- AI confidence bar -->
    <rect x="20" y="160" width="200" height="6" rx="3" fill="rgba(255,255,255,0.05)"/>
    <rect x="20" y="160" width="174" height="6" rx="3" fill="url(#xrayGrad2)"/>
    <defs><linearGradient id="xrayGrad2" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2e9e63"/><stop offset="100%" stop-color="#2f8f6a"/></linearGradient></defs>
    <text x="230" y="167" font-size="8" fill="#2e9e63" font-family="monospace">87%</text>
  </svg>`,

  heatmap: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hmGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient>
    </defs>
    <rect width="320" height="180" fill="url(#hmGrad)"/>
    <!-- Heatmap grid -->
    <g>
      <!-- Row 1 -->
      <rect x="30" y="20" width="32" height="28" rx="2" fill="rgba(26,70,29,0.3)"/>
      <rect x="66" y="20" width="32" height="28" rx="2" fill="rgba(41,97,45,0.5)"/>
      <rect x="102" y="20" width="32" height="28" rx="2" fill="rgba(54,122,60,0.6)"/>
      <rect x="138" y="20" width="32" height="28" rx="2" fill="rgba(72,154,79,0.7)"/>
      <rect x="174" y="20" width="32" height="28" rx="2" fill="rgba(89,185,97,0.8)"/>
      <rect x="210" y="20" width="32" height="28" rx="2" fill="rgba(82,173,90,0.7)"/>
      <rect x="246" y="20" width="32" height="28" rx="2" fill="rgba(67,146,74,0.5)"/>
      <!-- Row 2 -->
      <rect x="30" y="52" width="32" height="28" rx="2" fill="rgba(41,97,45,0.5)"/>
      <rect x="66" y="52" width="32" height="28" rx="2" fill="rgba(61,135,68,0.7)"/>
      <rect x="102" y="52" width="32" height="28" rx="2" fill="rgba(77,163,84,0.8)"/>
      <rect x="138" y="52" width="32" height="28" rx="2" fill="rgba(103,211,113,0.9)"/>
      <rect x="174" y="52" width="32" height="28" rx="2" fill="rgba(91,189,100,1)"/>
      <rect x="210" y="52" width="32" height="28" rx="2" fill="rgba(70,151,77,0.9)"/>
      <rect x="246" y="52" width="32" height="28" rx="2" fill="rgba(56,124,61,0.7)"/>
      <!-- Row 3 (hot center) -->
      <rect x="30" y="84" width="32" height="28" rx="2" fill="rgba(54,122,60,0.6)"/>
      <rect x="66" y="84" width="32" height="28" rx="2" fill="rgba(72,154,79,0.7)"/>
      <rect x="102" y="84" width="32" height="28" rx="2" fill="rgba(103,211,113,0.9)"/>
      <rect x="138" y="84" width="32" height="28" rx="2" fill="rgba(62,135,68,1)"/>
      <rect x="174" y="84" width="32" height="28" rx="2" fill="rgba(56,124,61,1)"/>
      <rect x="210" y="84" width="32" height="28" rx="2" fill="rgba(70,151,77,0.9)"/>
      <rect x="246" y="84" width="32" height="28" rx="2" fill="rgba(53,120,59,0.7)"/>
      <!-- Row 4 -->
      <rect x="30" y="116" width="32" height="28" rx="2" fill="rgba(41,97,45,0.5)"/>
      <rect x="66" y="116" width="32" height="28" rx="2" fill="rgba(72,154,79,0.6)"/>
      <rect x="102" y="116" width="32" height="28" rx="2" fill="rgba(89,185,97,0.7)"/>
      <rect x="138" y="116" width="32" height="28" rx="2" fill="rgba(82,173,90,0.8)"/>
      <rect x="174" y="116" width="32" height="28" rx="2" fill="rgba(70,151,77,0.7)"/>
      <rect x="210" y="116" width="32" height="28" rx="2" fill="rgba(45,104,49,0.5)"/>
      <rect x="246" y="116" width="32" height="28" rx="2" fill="rgba(31,79,34,0.4)"/>
    </g>
    <!-- Color scale -->
    <defs><linearGradient id="hmScale" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2f8f6a"/><stop offset="33%" stop-color="#2e9e63"/><stop offset="66%" stop-color="#cf9a37"/><stop offset="100%" stop-color="#2e9e63"/></linearGradient></defs>
    <rect x="30" y="152" width="250" height="8" rx="4" fill="url(#hmScale)"/>
    <text x="30" y="170" font-size="8" fill="#8a978c" font-family="monospace">low</text>
    <text x="270" y="170" font-size="8" fill="#8a978c" font-family="monospace">high</text>
  </svg>`,

  moleculeNet: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="molGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#molGrad)"/>
    <!-- Molecule network -->
    <g fill="none">
      <!-- Bonds -->
      <line x1="160" y1="90" x2="110" y2="55" stroke="#2e9e63" stroke-width="2" opacity="0.6"/>
      <line x1="160" y1="90" x2="210" y2="55" stroke="#2e9e63" stroke-width="2" opacity="0.6"/>
      <line x1="160" y1="90" x2="160" y2="145" stroke="#2e9e63" stroke-width="2" opacity="0.6"/>
      <line x1="110" y1="55" x2="65" y2="75" stroke="#2f8f6a" stroke-width="1.5" opacity="0.5"/>
      <line x1="110" y1="55" x2="90" y2="20" stroke="#2f8f6a" stroke-width="1.5" opacity="0.5"/>
      <line x1="210" y1="55" x2="255" y2="75" stroke="#2f8f6a" stroke-width="1.5" opacity="0.5"/>
      <line x1="210" y1="55" x2="230" y2="20" stroke="#2f8f6a" stroke-width="1.5" opacity="0.5"/>
      <line x1="160" y1="145" x2="120" y2="168" stroke="#5b97c4" stroke-width="1.5" opacity="0.5"/>
      <line x1="160" y1="145" x2="200" y2="168" stroke="#5b97c4" stroke-width="1.5" opacity="0.5"/>
    </g>
    <!-- Atoms -->
    <circle cx="160" cy="90" r="14" fill="rgba(46,158,99,0.2)" stroke="#2e9e63" stroke-width="2"/><text x="160" y="95" font-size="10" fill="#2e9e63" text-anchor="middle" font-weight="bold">C</text>
    <circle cx="110" cy="55" r="11" fill="rgba(47,143,106,0.2)" stroke="#2f8f6a" stroke-width="1.5"/><text x="110" y="59" font-size="9" fill="#2f8f6a" text-anchor="middle">N</text>
    <circle cx="210" cy="55" r="11" fill="rgba(47,143,106,0.2)" stroke="#2f8f6a" stroke-width="1.5"/><text x="210" y="59" font-size="9" fill="#2f8f6a" text-anchor="middle">O</text>
    <circle cx="160" cy="145" r="11" fill="rgba(91,151,196,0.2)" stroke="#5b97c4" stroke-width="1.5"/><text x="160" y="149" font-size="9" fill="#5b97c4" text-anchor="middle">H</text>
    <circle cx="65" cy="75" r="8" fill="rgba(207,154,55,0.15)" stroke="#cf9a37" stroke-width="1"/><text x="65" y="79" font-size="8" fill="#cf9a37" text-anchor="middle">C</text>
    <circle cx="90" cy="20" r="8" fill="rgba(207,154,55,0.15)" stroke="#cf9a37" stroke-width="1"/><text x="90" y="24" font-size="8" fill="#cf9a37" text-anchor="middle">H</text>
    <circle cx="255" cy="75" r="8" fill="rgba(207,154,55,0.15)" stroke="#cf9a37" stroke-width="1"/><text x="255" y="79" font-size="8" fill="#cf9a37" text-anchor="middle">N</text>
    <circle cx="230" cy="20" r="8" fill="rgba(207,154,55,0.15)" stroke="#cf9a37" stroke-width="1"/><text x="230" y="24" font-size="8" fill="#cf9a37" text-anchor="middle">O</text>
    <text x="15" y="170" font-size="8" fill="#8a978c" font-family="monospace">SMILES · Molecular Generation</text>
  </svg>`,

  pathologySlide: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="pathGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#pathGrad)"/>
    <!-- Microscope slide texture -->
    <circle cx="80" cy="70" r="25" fill="rgba(69,149,76,0.12)" stroke="rgba(69,149,76,0.3)" stroke-width="1"/>
    <circle cx="140" cy="50" r="18" fill="rgba(56,125,62,0.15)" stroke="rgba(69,149,76,0.25)" stroke-width="1"/>
    <circle cx="200" cy="80" r="22" fill="rgba(79,168,87,0.1)" stroke="rgba(69,149,76,0.3)" stroke-width="1"/>
    <circle cx="260" cy="55" r="16" fill="rgba(63,137,69,0.13)" stroke="rgba(69,149,76,0.2)" stroke-width="1"/>
    <circle cx="100" cy="120" r="20" fill="rgba(56,125,62,0.1)" stroke="rgba(69,149,76,0.25)" stroke-width="1"/>
    <circle cx="170" cy="130" r="28" fill="rgba(69,149,76,0.15)" stroke="rgba(69,149,76,0.3)" stroke-width="1"/>
    <circle cx="240" cy="125" r="19" fill="rgba(63,137,69,0.12)" stroke="rgba(69,149,76,0.2)" stroke-width="1"/>
    <!-- Nucleus dots -->
    <circle cx="80" cy="70" r="8" fill="rgba(62,136,68,0.4)"/>
    <circle cx="140" cy="50" r="6" fill="rgba(56,124,61,0.5)"/>
    <circle cx="200" cy="80" r="7" fill="rgba(62,136,68,0.4)"/>
    <circle cx="170" cy="130" r="10" fill="rgba(62,136,68,0.5)"/>
    <!-- Detection box -->
    <rect x="155" y="115" width="50" height="50" fill="none" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="4 2"/>
    <text x="207" y="130" font-size="8" fill="#5b97c4" font-family="monospace">TUMOR</text>
    <text x="207" y="142" font-size="8" fill="#5b97c4" font-family="monospace">94.2%</text>
    <!-- Scale bar -->
    <line x1="20" y1="165" x2="60" y2="165" stroke="#8a978c" stroke-width="1"/>
    <text x="65" y="169" font-size="7" fill="#8a978c" font-family="monospace">50μm</text>
    <text x="220" y="169" font-size="7" fill="#8a978c" font-family="monospace">H&E Stain · WSI</text>
  </svg>`,

  proteinFold: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="protGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#protGrad)"/>
    <!-- Alpha helix -->
    <path d="M50,60 C60,45 80,45 90,60 C100,75 120,75 130,60 C140,45 160,45 170,60 C180,75 200,75 210,60" fill="none" stroke="#2f8f6a" stroke-width="3" opacity="0.8"/>
    <!-- Beta sheet arrows -->
    <path d="M50,110 L120,110 L120,100 L140,115 L120,130 L120,120 L50,120 Z" fill="rgba(46,158,99,0.15)" stroke="#2e9e63" stroke-width="1.5"/>
    <path d="M160,105 L220,105 L220,95 L240,110 L220,125 L220,115 L160,115 Z" fill="rgba(46,158,99,0.15)" stroke="#2e9e63" stroke-width="1.5"/>
    <!-- Loop connections -->
    <path d="M170,60 Q230,30 250,110" fill="none" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.7"/>
    <path d="M210,60 Q275,80 280,105" fill="none" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.5"/>
    <!-- Labels -->
    <rect x="55" y="44" width="14" height="8" rx="2" fill="#2f8f6a" opacity="0.5"/>
    <text x="62" y="51" font-size="6" fill="white" text-anchor="middle">α</text>
    <rect x="75" y="108" width="14" height="8" rx="2" fill="#2e9e63" opacity="0.5"/>
    <text x="82" y="115" font-size="6" fill="white" text-anchor="middle">β</text>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">Protein Structure · AlphaFold</text>
  </svg>`,

  ecgWave: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ecgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#ecgGrad)"/>
    <!-- Grid -->
    <g stroke="rgba(92,191,101,0.08)" stroke-width="0.5">
      <line x1="0" y1="45" x2="320" y2="45"/><line x1="0" y1="90" x2="320" y2="90"/><line x1="0" y1="135" x2="320" y2="135"/>
      <line x1="64" y1="0" x2="64" y2="180"/><line x1="128" y1="0" x2="128" y2="180"/><line x1="192" y1="0" x2="192" y2="180"/><line x1="256" y1="0" x2="256" y2="180"/>
    </g>
    <!-- ECG wave -->
    <polyline points="10,90 30,90 35,90 40,75 45,115 50,30 55,150 60,90 75,90 80,85 85,90 100,90 105,90 110,75 115,115 120,30 125,150 130,90 145,90 150,85 155,90 170,90 175,90 180,75 185,115 190,30 195,150 200,90 215,90 220,85 225,90 240,90 245,90 250,75 255,115 260,30 265,150 270,90 285,90 290,85 295,90 310,90"
      fill="none" stroke="#2e9e63" stroke-width="1.5" opacity="0.9"/>
    <!-- Annotation -->
    <rect x="48" y="18" width="20" height="10" rx="2" fill="rgba(207,154,55,0.2)" stroke="#cf9a37" stroke-width="0.8"/>
    <text x="58" y="26" font-size="6.5" fill="#cf9a37" text-anchor="middle" font-family="monospace">QRS</text>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">ECG · Cardiology AI</text>
  </svg>`,

  retinalScan: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="retGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></radialGradient>
    </defs>
    <rect width="320" height="180" fill="url(#retGrad)"/>
    <!-- Eye outline -->
    <ellipse cx="160" cy="90" rx="130" ry="70" fill="rgba(90,187,99,0.03)" stroke="rgba(90,187,99,0.2)" stroke-width="1"/>
    <!-- Retinal vessels -->
    <path d="M160,90 Q130,70 100,55" fill="none" stroke="rgba(61,134,67,0.6)" stroke-width="1.5"/>
    <path d="M160,90 Q190,70 220,55" fill="none" stroke="rgba(61,134,67,0.6)" stroke-width="1.5"/>
    <path d="M160,90 Q140,115 115,130" fill="none" stroke="rgba(48,110,53,0.5)" stroke-width="1.2"/>
    <path d="M160,90 Q180,115 205,130" fill="none" stroke="rgba(48,110,53,0.5)" stroke-width="1.2"/>
    <!-- Branch vessels -->
    <path d="M130,72 Q115,62 100,55" fill="none" stroke="rgba(54,122,60,0.4)" stroke-width="0.8"/>
    <path d="M190,72 Q205,62 220,55" fill="none" stroke="rgba(54,122,60,0.4)" stroke-width="0.8"/>
    <!-- Optic disc -->
    <circle cx="200" cy="85" r="15" fill="rgba(103,211,113,0.12)" stroke="rgba(103,211,113,0.4)" stroke-width="1.5"/>
    <circle cx="200" cy="85" r="7" fill="rgba(103,211,113,0.2)" stroke="rgba(103,211,113,0.5)" stroke-width="1"/>
    <!-- Macula -->
    <circle cx="130" cy="90" r="10" fill="rgba(77,163,84,0.08)" stroke="rgba(77,163,84,0.3)" stroke-width="1"/>
    <circle cx="130" cy="90" r="4" fill="rgba(77,163,84,0.15)"/>
    <!-- AI detection -->
    <rect x="120" y="80" width="24" height="24" fill="none" stroke="#2e9e63" stroke-width="1" stroke-dasharray="3 2"/>
    <text x="148" y="88" font-size="7" fill="#2e9e63" font-family="monospace">MACULA</text>
    <text x="148" y="98" font-size="7" fill="#2e9e63" font-family="monospace">Normal</text>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">Retinal OCT · Ophthalmology</text>
  </svg>`,

  neuronNet: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="nnGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#nnGrad)"/>
    <!-- Input nodes -->
    <circle cx="40" cy="45" r="8" fill="rgba(46,158,99,0.2)" stroke="#2e9e63" stroke-width="1.5"/>
    <circle cx="40" cy="90" r="8" fill="rgba(46,158,99,0.2)" stroke="#2e9e63" stroke-width="1.5"/>
    <circle cx="40" cy="135" r="8" fill="rgba(46,158,99,0.2)" stroke="#2e9e63" stroke-width="1.5"/>
    <!-- Hidden layer 1 -->
    <circle cx="110" cy="30" r="9" fill="rgba(47,143,106,0.2)" stroke="#2f8f6a" stroke-width="1.5"/>
    <circle cx="110" cy="70" r="9" fill="rgba(47,143,106,0.2)" stroke="#2f8f6a" stroke-width="1.5"/>
    <circle cx="110" cy="110" r="9" fill="rgba(47,143,106,0.2)" stroke="#2f8f6a" stroke-width="1.5"/>
    <circle cx="110" cy="150" r="9" fill="rgba(47,143,106,0.2)" stroke="#2f8f6a" stroke-width="1.5"/>
    <!-- Hidden layer 2 -->
    <circle cx="190" cy="50" r="9" fill="rgba(79,168,87,0.2)" stroke="#8a78c6" stroke-width="1.5"/>
    <circle cx="190" cy="90" r="9" fill="rgba(79,168,87,0.2)" stroke="#8a78c6" stroke-width="1.5"/>
    <circle cx="190" cy="130" r="9" fill="rgba(79,168,87,0.2)" stroke="#8a78c6" stroke-width="1.5"/>
    <!-- Output node -->
    <circle cx="270" cy="90" r="12" fill="rgba(91,151,196,0.2)" stroke="#5b97c4" stroke-width="2"/>
    <!-- Connections -->
    <g stroke="rgba(46,158,99,0.12)" stroke-width="0.8">
      <line x1="48" y1="45" x2="101" y2="30"/><line x1="48" y1="45" x2="101" y2="70"/><line x1="48" y1="45" x2="101" y2="110"/><line x1="48" y1="45" x2="101" y2="150"/>
      <line x1="48" y1="90" x2="101" y2="30"/><line x1="48" y1="90" x2="101" y2="70"/><line x1="48" y1="90" x2="101" y2="110"/><line x1="48" y1="90" x2="101" y2="150"/>
      <line x1="48" y1="135" x2="101" y2="30"/><line x1="48" y1="135" x2="101" y2="70"/><line x1="48" y1="135" x2="101" y2="110"/><line x1="48" y1="135" x2="101" y2="150"/>
    </g>
    <g stroke="rgba(47,143,106,0.15)" stroke-width="0.8">
      <line x1="119" y1="30" x2="181" y2="50"/><line x1="119" y1="30" x2="181" y2="90"/><line x1="119" y1="30" x2="181" y2="130"/>
      <line x1="119" y1="70" x2="181" y2="50"/><line x1="119" y1="70" x2="181" y2="90"/><line x1="119" y1="70" x2="181" y2="130"/>
      <line x1="119" y1="110" x2="181" y2="50"/><line x1="119" y1="110" x2="181" y2="90"/><line x1="119" y1="110" x2="181" y2="130"/>
      <line x1="119" y1="150" x2="181" y2="50"/><line x1="119" y1="150" x2="181" y2="90"/><line x1="119" y1="150" x2="181" y2="130"/>
    </g>
    <g stroke="rgba(79,168,87,0.2)" stroke-width="1">
      <line x1="199" y1="50" x2="258" y2="90"/><line x1="199" y1="90" x2="258" y2="90"/><line x1="199" y1="130" x2="258" y2="90"/>
    </g>
    <text x="20" y="170" font-size="8" fill="#8a978c" font-family="monospace">Deep Neural Network</text>
  </svg>`,

  skinDerm: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#skinGrad)"/>
    <!-- Skin texture circles (dermoscopy) -->
    <circle cx="160" cy="90" r="70" fill="rgba(70,150,77,0.08)" stroke="rgba(70,150,77,0.2)" stroke-width="1.5"/>
    <!-- Pigment dots -->
    <circle cx="145" cy="75" r="6" fill="rgba(25,68,27,0.6)"/>
    <circle cx="165" cy="70" r="4" fill="rgba(31,79,34,0.7)"/>
    <circle cx="175" cy="85" r="8" fill="rgba(19,56,20,0.8)"/>
    <circle cx="150" cy="95" r="5" fill="rgba(28,73,31,0.6)"/>
    <circle cx="170" cy="100" r="7" fill="rgba(22,62,24,0.7)"/>
    <circle cx="140" cy="90" r="4" fill="rgba(34,85,38,0.5)"/>
    <circle cx="160" cy="80" r="9" fill="rgba(15,51,17,0.9)"/>
    <!-- Vascular structures -->
    <path d="M120,70 Q140,80 135,100 Q130,115 150,120" fill="none" stroke="rgba(61,134,67,0.4)" stroke-width="1"/>
    <path d="M190,65 Q175,80 185,95 Q195,110 175,125" fill="none" stroke="rgba(61,134,67,0.35)" stroke-width="1"/>
    <!-- ABCDE analysis box -->
    <rect x="240" y="25" width="65" height="75" rx="6" fill="rgba(0,0,0,0.4)" stroke="rgba(46,158,99,0.3)" stroke-width="1"/>
    <text x="272" y="40" font-size="8" fill="#2e9e63" text-anchor="middle" font-family="monospace">ABCDE</text>
    <text x="248" y="55" font-size="7" fill="#5b97c4" font-family="monospace">A: 0.87</text>
    <text x="248" y="66" font-size="7" fill="#2f8f6a" font-family="monospace">B: 0.72</text>
    <text x="248" y="77" font-size="7" fill="#cf9a37" font-family="monospace">C: 0.91</text>
    <text x="248" y="88" font-size="7" fill="#2e9e63" font-family="monospace">D: 0.68</text>
    <text x="272" y="103" font-size="7.5" fill="#5b97c4" text-anchor="middle" font-weight="bold" font-family="monospace">MEL</text>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">Dermoscopy · Skin Lesion AI</text>
  </svg>`,

  ctScan: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ctGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#ctGrad)"/>
    <!-- CT scan cross-sections -->
    <g opacity="0.9">
      <!-- Main scan -->
      <circle cx="80" cy="55" r="40" fill="rgba(0,0,0,0.5)" stroke="rgba(82,173,90,0.3)" stroke-width="1"/>
      <ellipse cx="80" cy="55" rx="30" ry="28" fill="rgba(41,98,46,0.15)" stroke="rgba(82,173,90,0.2)" stroke-width="1"/>
      <ellipse cx="80" cy="55" rx="18" ry="20" fill="rgba(63,138,69,0.2)"/>
      <!-- Bone -->
      <ellipse cx="80" cy="55" rx="28" ry="26" fill="none" stroke="rgba(109,222,120,0.4)" stroke-width="2"/>
      <!-- Organ slice -->
      <ellipse cx="80" cy="58" rx="15" ry="12" fill="rgba(50,115,56,0.3)" stroke="rgba(65,142,71,0.4)" stroke-width="1"/>
    </g>
    <!-- Annotation arrows -->
    <line x1="98" y1="45" x2="130" y2="35" stroke="#cf9a37" stroke-width="1"/>
    <text x="135" y="38" font-size="8" fill="#cf9a37" font-family="monospace">Liver</text>
    <line x1="65" y1="65" x2="35" y2="80" stroke="#2e9e63" stroke-width="1"/>
    <text x="10" y="83" font-size="8" fill="#2e9e63" font-family="monospace">Bone</text>
    <!-- HU scale -->
    <rect x="160" y="20" width="15" height="130" rx="3" fill="rgba(0,0,0,0.3)" stroke="rgba(50,114,55,0.3)" stroke-width="0.5"/>
    <defs><linearGradient id="huScale" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="white"/><stop offset="30%" stop-color="#8a978c"/><stop offset="60%" stop-color="#eef3ec"/><stop offset="100%" stop-color="black"/></linearGradient></defs>
    <rect x="161" y="21" width="13" height="128" rx="2" fill="url(#huScale)"/>
    <text x="180" y="25" font-size="7" fill="#8a978c" font-family="monospace">+1000</text>
    <text x="180" y="90" font-size="7" fill="#6a7a6e" font-family="monospace">0</text>
    <text x="180" y="152" font-size="7" fill="#526056" font-family="monospace">-1000</text>
    <!-- Multiple slices -->
    <g opacity="0.5">
      <circle cx="230" cy="45" r="30" fill="rgba(41,98,46,0.1)" stroke="rgba(82,173,90,0.25)" stroke-width="1"/>
      <circle cx="285" cy="45" r="25" fill="rgba(41,98,46,0.1)" stroke="rgba(82,173,90,0.2)" stroke-width="1"/>
      <circle cx="230" cy="130" r="30" fill="rgba(41,98,46,0.1)" stroke="rgba(82,173,90,0.25)" stroke-width="1"/>
      <circle cx="285" cy="130" r="25" fill="rgba(41,98,46,0.1)" stroke="rgba(82,173,90,0.2)" stroke-width="1"/>
    </g>
    <text x="208" y="175" font-size="8" fill="#8a978c" font-family="monospace">CT Axial Slices · 3D Recon</text>
  </svg>`,

  genomicSeq: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="gsGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#gsGrad)"/>
    <!-- Sequence bars -->
    <g font-family="monospace" font-size="9">
      <text x="15" y="35" fill="#2e9e63">ATCGATCGATCGATCG</text>
      <text x="15" y="50" fill="#5b97c4">GCATGCATGCATGCAT</text>
      <text x="15" y="65" fill="#2f8f6a">TTACGTTACGTTACGT</text>
      <text x="15" y="80" fill="#cf9a37">CGTAGCTAGCTAGCTA</text>
      <text x="15" y="95" fill="#2e9e63" opacity="0.7">ATCGATCGATCGATCG</text>
      <text x="15" y="110" fill="#5b97c4" opacity="0.5">GCATGCATGCATGCAT</text>
    </g>
    <!-- Variant highlight -->
    <rect x="100" y="56" width="9" height="12" rx="1" fill="rgba(91,151,196,0.3)" stroke="#5b97c4" stroke-width="1"/>
    <rect x="100" y="71" width="9" height="12" rx="1" fill="rgba(91,151,196,0.3)" stroke="#5b97c4" stroke-width="1"/>
    <!-- Quality scores -->
    <rect x="15" y="125" width="280" height="8" rx="2" fill="rgba(0,0,0,0.3)"/>
    <g>
      <rect x="15" y="125" width="18" height="8" rx="1" fill="#2e9e63" opacity="0.8"/>
      <rect x="35" y="125" width="22" height="8" rx="1" fill="#2e9e63" opacity="0.9"/>
      <rect x="59" y="125" width="15" height="8" rx="1" fill="#cf9a37" opacity="0.7"/>
      <rect x="76" y="125" width="20" height="8" rx="1" fill="#2e9e63"/>
      <rect x="98" y="125" width="12" height="8" rx="1" fill="#5b97c4" opacity="0.6"/>
      <rect x="112" y="125" width="25" height="8" rx="1" fill="#2e9e63" opacity="0.85"/>
      <rect x="139" y="125" width="18" height="8" rx="1" fill="#cf9a37" opacity="0.8"/>
      <rect x="159" y="125" width="22" height="8" rx="1" fill="#2e9e63"/>
      <rect x="183" y="125" width="16" height="8" rx="1" fill="#2e9e63" opacity="0.7"/>
      <rect x="201" y="125" width="20" height="8" rx="1" fill="#cf9a37" opacity="0.6"/>
      <rect x="223" y="125" width="14" height="8" rx="1" fill="#2e9e63" opacity="0.9"/>
      <rect x="239" y="125" width="24" height="8" rx="1" fill="#2e9e63"/>
      <rect x="265" y="125" width="18" height="8" rx="1" fill="#5b97c4" opacity="0.5"/>
    </g>
    <!-- Reference track -->
    <rect x="15" y="142" width="280" height="5" rx="2" fill="rgba(46,158,99,0.08)" stroke="rgba(46,158,99,0.15)" stroke-width="1"/>
    <text x="15" y="165" font-size="8" fill="#8a978c" font-family="monospace">WGS · Variant Calling · NGS</text>
    <text x="220" y="165" font-size="8" fill="#8a978c" font-family="monospace">Phred Q30</text>
  </svg>`,

  drugTarget: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dtGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#dtGrad)"/>
    <!-- Protein pocket -->
    <ellipse cx="160" cy="85" rx="75" ry="60" fill="rgba(47,143,106,0.05)" stroke="rgba(47,143,106,0.25)" stroke-width="1.5"/>
    <path d="M100,85 Q110,60 130,55 Q150,50 160,55 Q170,50 190,55 Q210,60 220,85 Q210,110 190,115 Q170,120 160,115 Q150,120 130,115 Q110,110 100,85 Z" fill="rgba(47,143,106,0.08)" stroke="rgba(47,143,106,0.3)" stroke-width="1"/>
    <!-- Binding pocket indentation -->
    <ellipse cx="160" cy="82" rx="30" ry="22" fill="rgba(46,158,99,0.06)" stroke="rgba(46,158,99,0.2)" stroke-width="1"/>
    <!-- Drug molecule in pocket -->
    <circle cx="160" cy="80" r="12" fill="rgba(207,154,55,0.25)" stroke="#cf9a37" stroke-width="2"/>
    <circle cx="160" cy="80" r="5" fill="rgba(207,154,55,0.5)"/>
    <!-- Binding bonds -->
    <line x1="148" y1="80" x2="138" y2="75" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="3 2"/>
    <line x1="172" y1="80" x2="182" y2="75" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="3 2"/>
    <line x1="160" y1="68" x2="160" y2="58" stroke="#2e9e63" stroke-width="1.5" stroke-dasharray="3 2"/>
    <line x1="160" y1="92" x2="160" y2="102" stroke="#2e9e63" stroke-width="1.5" stroke-dasharray="3 2"/>
    <!-- Score gauge -->
    <rect x="240" y="50" width="65" height="80" rx="6" fill="rgba(0,0,0,0.4)" stroke="rgba(47,143,106,0.3)" stroke-width="1"/>
    <text x="272" y="66" font-size="7.5" fill="#2f8f6a" text-anchor="middle" font-family="monospace">Docking</text>
    <text x="272" y="79" font-size="10" fill="#cf9a37" text-anchor="middle" font-weight="bold" font-family="monospace">-8.4</text>
    <text x="272" y="90" font-size="7" fill="#8a978c" text-anchor="middle" font-family="monospace">kcal/mol</text>
    <text x="272" y="103" font-size="7.5" fill="#2e9e63" text-anchor="middle" font-family="monospace">IC50:</text>
    <text x="272" y="116" font-size="7.5" fill="#2e9e63" text-anchor="middle" font-family="monospace">42 nM</text>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">Target Docking · Drug Design</text>
  </svg>`,

  microbiome: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="mbGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></radialGradient></defs>
    <rect width="320" height="180" fill="url(#mbGrad)"/>
    <!-- Bacteria shapes -->
    <ellipse cx="60" cy="50" rx="20" ry="10" fill="rgba(46,158,99,0.15)" stroke="#2e9e63" stroke-width="1" transform="rotate(-30,60,50)"/>
    <ellipse cx="130" cy="40" rx="15" ry="8" fill="rgba(47,143,106,0.15)" stroke="#2f8f6a" stroke-width="1" transform="rotate(15,130,40)"/>
    <ellipse cx="200" cy="60" rx="18" ry="9" fill="rgba(91,151,196,0.15)" stroke="#5b97c4" stroke-width="1" transform="rotate(-20,200,60)"/>
    <ellipse cx="260" cy="45" rx="14" ry="7" fill="rgba(207,154,55,0.15)" stroke="#cf9a37" stroke-width="1" transform="rotate(10,260,45)"/>
    <ellipse cx="80" cy="120" rx="16" ry="8" fill="rgba(46,158,99,0.12)" stroke="#2e9e63" stroke-width="1" transform="rotate(25,80,120)"/>
    <ellipse cx="170" cy="130" rx="22" ry="11" fill="rgba(47,143,106,0.12)" stroke="#2f8f6a" stroke-width="1" transform="rotate(-15,170,130)"/>
    <ellipse cx="240" cy="115" rx="17" ry="8" fill="rgba(91,151,196,0.12)" stroke="#5b97c4" stroke-width="1" transform="rotate(5,240,115)"/>
    <!-- Flagella -->
    <path d="M75,45 Q85,35 100,30" fill="none" stroke="#2e9e63" stroke-width="0.8" opacity="0.5"/>
    <path d="M215,55 Q230,45 250,40" fill="none" stroke="#5b97c4" stroke-width="0.8" opacity="0.5"/>
    <!-- Pie chart -->
    <circle cx="155" cy="90" r="35" fill="transparent" stroke-width="12" stroke="rgba(46,158,99,0.3)" stroke-dasharray="55 110" stroke-dashoffset="-27"/>
    <circle cx="155" cy="90" r="35" fill="transparent" stroke-width="12" stroke="rgba(47,143,106,0.3)" stroke-dasharray="30 110" stroke-dashoffset="28"/>
    <circle cx="155" cy="90" r="35" fill="transparent" stroke-width="12" stroke="rgba(91,151,196,0.3)" stroke-dasharray="25 110" stroke-dashoffset="58"/>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">Microbiome · 16S rRNA Analysis</text>
  </svg>`,

  speechWave: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="swGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#swGrad)"/>
    <!-- Waveform -->
    <g transform="translate(0,90)">
      <polyline points="10,0 20,-5 30,15 40,-25 50,35 60,-40 70,45 80,-35 90,30 100,-20 110,25 120,-15 130,20 140,-10 150,18 160,-8 170,15 180,-12 190,22 200,-18 210,28 220,-22 230,30 240,-25 250,20 260,-15 270,12 280,-8 290,5 300,-3 310,0"
        fill="none" stroke="url(#swColor)" stroke-width="2"/>
      <defs><linearGradient id="swColor" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2e9e63"/><stop offset="100%" stop-color="#2f8f6a"/></linearGradient></defs>
    </g>
    <!-- Spectrogram -->
    <g transform="translate(10,115)">
      <g opacity="0.7">
        <rect x="0" y="0" width="8" height="20" rx="1" fill="#2e9e63" opacity="0.9"/>
        <rect x="10" y="5" width="8" height="15" rx="1" fill="#2e9e63" opacity="0.8"/>
        <rect x="20" y="-5" width="8" height="30" rx="1" fill="#2f8f6a" opacity="0.9"/>
        <rect x="30" y="2" width="8" height="18" rx="1" fill="#2e9e63" opacity="0.7"/>
        <rect x="40" y="-8" width="8" height="35" rx="1" fill="#5b97c4" opacity="0.6"/>
        <rect x="50" y="0" width="8" height="22" rx="1" fill="#2e9e63" opacity="0.8"/>
        <rect x="60" y="3" width="8" height="17" rx="1" fill="#2f8f6a" opacity="0.7"/>
        <rect x="70" y="-3" width="8" height="26" rx="1" fill="#2e9e63" opacity="0.9"/>
        <rect x="80" y="6" width="8" height="14" rx="1" fill="#cf9a37" opacity="0.6"/>
        <rect x="90" y="-2" width="8" height="24" rx="1" fill="#2e9e63" opacity="0.8"/>
        <rect x="100" y="4" width="8" height="16" rx="1" fill="#2f8f6a" opacity="0.7"/>
        <rect x="110" y="-6" width="8" height="32" rx="1" fill="#5b97c4" opacity="0.5"/>
        <rect x="120" y="1" width="8" height="21" rx="1" fill="#2e9e63" opacity="0.9"/>
        <rect x="130" y="-4" width="8" height="28" rx="1" fill="#2f8f6a" opacity="0.8"/>
        <rect x="140" y="2" width="8" height="20" rx="1" fill="#2e9e63" opacity="0.7"/>
        <rect x="150" y="-1" width="8" height="23" rx="1" fill="#cf9a37" opacity="0.6"/>
        <rect x="160" y="5" width="8" height="15" rx="1" fill="#2e9e63" opacity="0.8"/>
        <rect x="170" y="-7" width="8" height="33" rx="1" fill="#5b97c4" opacity="0.5"/>
        <rect x="180" y="3" width="8" height="17" rx="1" fill="#2e9e63" opacity="0.9"/>
        <rect x="190" y="-2" width="8" height="25" rx="1" fill="#2f8f6a" opacity="0.7"/>
        <rect x="200" y="0" width="8" height="22" rx="1" fill="#2e9e63" opacity="0.8"/>
        <rect x="210" y="4" width="8" height="16" rx="1" fill="#cf9a37" opacity="0.6"/>
        <rect x="220" y="-5" width="8" height="30" rx="1" fill="#2f8f6a" opacity="0.7"/>
        <rect x="230" y="2" width="8" height="19" rx="1" fill="#2e9e63" opacity="0.9"/>
        <rect x="240" y="-3" width="8" height="26" rx="1" fill="#5b97c4" opacity="0.5"/>
        <rect x="250" y="1" width="8" height="21" rx="1" fill="#2e9e63" opacity="0.8"/>
        <rect x="260" y="-4" width="8" height="28" rx="1" fill="#2f8f6a" opacity="0.7"/>
        <rect x="270" y="6" width="8" height="14" rx="1" fill="#2e9e63" opacity="0.6"/>
        <rect x="280" y="0" width="8" height="22" rx="1" fill="#cf9a37" opacity="0.7"/>
        <rect x="290" y="-2" width="8" height="24" rx="1" fill="#2e9e63" opacity="0.8"/>
      </g>
    </g>
    <text x="15" y="20" font-size="8" fill="#2e9e63" font-family="monospace" opacity="0.8">"Patient reports chest pain..."</text>
    <text x="20" y="170" font-size="8" fill="#8a978c" font-family="monospace">Medical ASR · Speech-to-Text</text>
  </svg>`,

  cellSegment: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="csGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></radialGradient></defs>
    <rect width="320" height="180" fill="url(#csGrad)"/>
    <!-- Cell instances with random colors -->
    <ellipse cx="70" cy="55" rx="35" ry="28" fill="rgba(46,158,99,0.1)" stroke="#2e9e63" stroke-width="1.5" stroke-dasharray="5 3"/>
    <ellipse cx="140" cy="75" rx="30" ry="32" fill="rgba(91,151,196,0.1)" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="5 3"/>
    <ellipse cx="210" cy="50" rx="28" ry="30" fill="rgba(47,143,106,0.1)" stroke="#2f8f6a" stroke-width="1.5" stroke-dasharray="5 3"/>
    <ellipse cx="270" cy="80" rx="32" ry="26" fill="rgba(207,154,55,0.1)" stroke="#cf9a37" stroke-width="1.5" stroke-dasharray="5 3"/>
    <ellipse cx="90" cy="135" rx="38" ry="25" fill="rgba(46,158,99,0.08)" stroke="#2e9e63" stroke-width="1.5" stroke-dasharray="5 3"/>
    <ellipse cx="180" cy="140" rx="28" ry="30" fill="rgba(138,120,198,0.1)" stroke="#8a78c6" stroke-width="1.5" stroke-dasharray="5 3"/>
    <ellipse cx="255" cy="140" rx="35" ry="24" fill="rgba(91,151,196,0.08)" stroke="#5b97c4" stroke-width="1.5" stroke-dasharray="5 3"/>
    <!-- Nuclei -->
    <circle cx="70" cy="55" r="10" fill="rgba(46,158,99,0.2)"/>
    <circle cx="140" cy="75" r="11" fill="rgba(91,151,196,0.2)"/>
    <circle cx="210" cy="50" r="9" fill="rgba(47,143,106,0.2)"/>
    <circle cx="270" cy="80" r="10" fill="rgba(207,154,55,0.2)"/>
    <circle cx="90" cy="135" r="12" fill="rgba(46,158,99,0.15)"/>
    <circle cx="180" cy="140" r="9" fill="rgba(138,120,198,0.2)"/>
    <circle cx="255" cy="140" r="11" fill="rgba(91,151,196,0.15)"/>
    <!-- Count overlay -->
    <rect x="250" y="10" width="60" height="28" rx="6" fill="rgba(0,0,0,0.5)" stroke="rgba(46,158,99,0.3)" stroke-width="1"/>
    <text x="280" y="22" font-size="8" fill="#2e9e63" text-anchor="middle" font-family="monospace">Cells: 7</text>
    <text x="280" y="33" font-size="7" fill="#2f8f6a" text-anchor="middle" font-family="monospace">Mitosis: 2</text>
    <text x="20" y="168" font-size="8" fill="#8a978c" font-family="monospace">Instance Segmentation · CPath</text>
  </svg>`,

  embeddingViz: `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="evGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#eef3ec"/><stop offset="100%" stop-color="#eef3ec"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#evGrad)"/>
    <!-- t-SNE clusters -->
    <!-- Cluster 1: green (normal) -->
    <circle cx="80" cy="80" r="4" fill="#2e9e63" opacity="0.8"/>
    <circle cx="90" cy="70" r="3" fill="#2e9e63" opacity="0.7"/>
    <circle cx="75" cy="90" r="4" fill="#2e9e63" opacity="0.9"/>
    <circle cx="95" cy="85" r="3" fill="#2e9e63" opacity="0.6"/>
    <circle cx="85" cy="100" r="4" fill="#2e9e63" opacity="0.8"/>
    <circle cx="70" cy="75" r="3" fill="#2e9e63" opacity="0.7"/>
    <circle cx="100" cy="95" r="4" fill="#2e9e63" opacity="0.6"/>
    <ellipse cx="85" cy="85" rx="25" ry="20" fill="rgba(46,158,99,0.05)" stroke="rgba(46,158,99,0.2)" stroke-width="1"/>
    <text x="85" y="115" font-size="7" fill="#2e9e63" text-anchor="middle" font-family="monospace">Normal</text>
    <!-- Cluster 2: pink (disease) -->
    <circle cx="200" cy="65" r="4" fill="#5b97c4" opacity="0.8"/>
    <circle cx="215" cy="75" r="3" fill="#5b97c4" opacity="0.7"/>
    <circle cx="195" cy="80" r="4" fill="#5b97c4" opacity="0.9"/>
    <circle cx="220" cy="55" r="3" fill="#5b97c4" opacity="0.6"/>
    <circle cx="210" cy="85" r="4" fill="#5b97c4" opacity="0.8"/>
    <circle cx="225" cy="70" r="3" fill="#5b97c4" opacity="0.7"/>
    <ellipse cx="210" cy="70" rx="22" ry="18" fill="rgba(91,151,196,0.05)" stroke="rgba(91,151,196,0.2)" stroke-width="1"/>
    <text x="210" y="97" font-size="7" fill="#5b97c4" text-anchor="middle" font-family="monospace">Tumor</text>
    <!-- Cluster 3: blue (intermediate) -->
    <circle cx="150" cy="130" r="4" fill="#2f8f6a" opacity="0.8"/>
    <circle cx="165" cy="140" r="3" fill="#2f8f6a" opacity="0.7"/>
    <circle cx="140" cy="145" r="4" fill="#2f8f6a" opacity="0.9"/>
    <circle cx="170" cy="130" r="3" fill="#2f8f6a" opacity="0.6"/>
    <ellipse cx="155" cy="137" rx="20" ry="14" fill="rgba(47,143,106,0.05)" stroke="rgba(47,143,106,0.2)" stroke-width="1"/>
    <text x="155" y="160" font-size="7" fill="#2f8f6a" text-anchor="middle" font-family="monospace">Benign</text>
    <text x="15" y="20" font-size="8" fill="#8a978c" font-family="monospace">t-SNE Embedding Visualization</text>
  </svg>`
};

// ── MODEL DATA (55 models) ─────────────────────────────────
const MODELS = [
  // ─────── GOOGLE ─────────────────────────────────────────
  { id:1, name:"MedGemma 4B", org:"Google DeepMind", orgTag:"google", size:"4B", cat:"multimodal imaging",
    desc:"흉부 X-ray 분석 + 의료 텍스트. 방사선 보고서 자동 생성, 피부과 분류. 최고의 소형 의료 멀티모달 AI.",
    tags:["Multimodal","X-ray","Gemma3"], dl:"83.6K", likes:70, license:"Gemma ToS",
    hf:"https://huggingface.co/google/medgemma-4b-it", visual:"xrayLung" },
  { id:2, name:"MedGemma 27B", org:"Google DeepMind", orgTag:"google", size:"27B", cat:"nlp multimodal",
    desc:"대규모 의료 텍스트 추론. MedQA 87.7% 달성. 의료 QA, 임상 결정 지원, EHR 분석에 특화.",
    tags:["Medical QA","EHR","USMLE"], dl:"10.2K", likes:118, license:"Gemma ToS",
    hf:"https://huggingface.co/google/medgemma-27b-it", visual:"neuronNet" },
  { id:3, name:"MedGemma 1.5 4B", org:"Google DeepMind", orgTag:"google", size:"4B", cat:"multimodal imaging",
    desc:"최신 MedGemma. CT 3D 볼륨 데이터 해석 최초 공개. 고차원 의료 이미지 처리 가능.",
    tags:["CT Scan","3D Volume","New"], dl:"8.4K", likes:55, license:"Gemma ToS",
    hf:"https://huggingface.co/collections/google/medgemma-release-680aade90d58b139e3a19b2e", visual:"ctScan" },
  { id:4, name:"MedSigLIP", org:"Google DeepMind", orgTag:"google", size:"400M", cat:"imaging multimodal",
    desc:"의료 이미지 임베딩 특화 SigLIP. 흉부 X-ray 트리아지, 결절 검출 최적화 이미지 인코더.",
    tags:["Image Encoder","X-ray","Embedding"], dl:"16.9K", likes:44, license:"Apache 2.0",
    hf:"https://huggingface.co/google/medsiglip-so400m-patch14-224", visual:"heatmap" },
  { id:5, name:"MedASR", org:"Google DeepMind", orgTag:"google", size:"~1B", cat:"nlp multimodal",
    desc:"의료 음성 인식 특화 ASR. 의사 구술 기록을 텍스트로 변환. MedGemma와 결합 가능.",
    tags:["Speech-to-Text","ASR","Clinical"], dl:"5.1K", likes:38, license:"Apache 2.0",
    hf:"https://huggingface.co/google/medasr", visual:"speechWave" },
  { id:6, name:"Path Foundation", org:"Google DeepMind", orgTag:"google", size:"ViT-B", cat:"imaging",
    desc:"병리학 WSI(전체 슬라이드) 특화 파운데이션 모델. 조직 분류, 암 진단 임베딩.",
    tags:["Pathology","WSI","ViT"], dl:"3.2K", likes:29, license:"Apache 2.0",
    hf:"https://huggingface.co/google/path-foundation", visual:"pathologySlide" },

  // ─────── MICROSOFT ───────────────────────────────────────
  { id:7, name:"BioGPT", org:"Microsoft", orgTag:"ms", size:"347M", cat:"nlp",
    desc:"PubMed 1,500만 건 학습. 생의학 텍스트 생성, 관계 추출, 의료 QA에 최적화된 GPT 계열.",
    tags:["GPT","PubMed","BioNLP"], dl:"17.4K", likes:489, license:"MIT",
    hf:"https://huggingface.co/microsoft/biogpt", visual:"clinicalBert" },
  { id:8, name:"PubMedBERT", org:"Microsoft", orgTag:"ms", size:"110M", cat:"nlp",
    desc:"PubMed 전문만으로 사전학습한 BERT. 의학 NER, 관계 추출, 문서 분류 SOTA.",
    tags:["BERT","NER","Biomedical"], dl:"533K", likes:384, license:"MIT",
    hf:"https://huggingface.co/microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext", visual:"embeddingViz" },
  { id:9, name:"BiomedCLIP", org:"Microsoft", orgTag:"ms", size:"ViT-B/16", cat:"multimodal imaging",
    desc:"의료 이미지-텍스트 대조학습 모델. PMC 논문 15M 쌍 학습. 제로샷 의료 이미지 분류.",
    tags:["CLIP","Medical","Zero-shot"], dl:"28.3K", likes:156, license:"MIT",
    hf:"https://huggingface.co/microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224", visual:"heatmap" },
  { id:10, name:"LLaVA-Med", org:"Microsoft", orgTag:"ms", size:"7B", cat:"multimodal",
    desc:"하루 만에 훈련하는 생의학 시각-언어 어시스턴트. 의료 이미지 QA에 특화된 LLaVA 파생.",
    tags:["VQA","LLaVA","Biomedicine"], dl:"9.1K", likes:213, license:"Apache 2.0",
    hf:"https://huggingface.co/microsoft/llava-med-v1.5-mistral-7b", visual:"ctScan" },
  { id:11, name:"InnerEye-DeepLearning", org:"Microsoft", orgTag:"ms", size:"CNN", cat:"imaging",
    desc:"방사선 치료 계획을 위한 의료 이미지 분할 프레임워크. 종양 윤곽 자동화.",
    tags:["Segmentation","Radiotherapy","3D"], dl:"4.5K", likes:87, license:"MIT",
    github:"https://github.com/microsoft/InnerEye-DeepLearning", visual:"ctScan" },

  // ─────── META AI ─────────────────────────────────────────
  { id:12, name:"ESM-2 (650M)", org:"Meta AI", orgTag:"meta", size:"650M", cat:"genomics",
    desc:"2.5억 단백질 서열 학습. 단백질 구조 예측, 기능 분류, 변이 효과 예측에 최적화.",
    tags:["Protein LM","Structure","MIT"], dl:"16.9K", likes:17, license:"MIT",
    hf:"https://huggingface.co/facebook/esm2_t33_650M_UR50D", visual:"dnaHelix" },
  { id:13, name:"ESM-2 (3B)", org:"Meta AI", orgTag:"meta", size:"3B", cat:"genomics",
    desc:"대규모 단백질 언어 모델. ESM-2 시리즈 중 연구용 최적 크기. 구조 예측 임베딩.",
    tags:["Protein","3B","Research"], dl:"8.2K", likes:22, license:"MIT",
    hf:"https://huggingface.co/facebook/esm2_t36_3B_UR50D", visual:"proteinFold" },
  { id:14, name:"ESMFold", org:"Meta AI", orgTag:"meta", size:"690M", cat:"genomics",
    desc:"단일 서열만으로 단백질 3D 구조 예측. AlphaFold2 속도의 수백 배. API로도 사용 가능.",
    tags:["Structure Pred","3D","Fast"], dl:"12.4K", likes:88, license:"MIT",
    hf:"https://huggingface.co/facebook/esmfold_v1", visual:"proteinFold" },
  { id:15, name:"Segment Anything Med", org:"Meta AI (adapt)", orgTag:"meta", size:"ViT-H", cat:"imaging",
    desc:"의료 이미지 특화 SAM. CT/MRI/내시경 이미지에서 클릭 한 번으로 장기 분할.",
    tags:["SAM","Segmentation","Interactive"], dl:"45.2K", likes:312, license:"Apache 2.0",
    hf:"https://huggingface.co/wanglab/medsam", visual:"cellSegment" },

  // ─────── MIT / Harvard ───────────────────────────────────
  { id:16, name:"ClinicalBERT", org:"MIT / Harvard", orgTag:"mit", size:"110M", cat:"nlp",
    desc:"MIMIC-III 임상 기록으로 학습된 BERT. 입원 예측, 재입원 위험도, 임상 NER에 활용.",
    tags:["BERT","EHR","MIMIC"], dl:"42.1K", likes:321, license:"Apache 2.0",
    hf:"https://huggingface.co/medicalai/ClinicalBERT", visual:"clinicalBert" },
  { id:17, name:"CONCH", org:"Harvard / Cornell", orgTag:"mit", size:"ViT-B", cat:"imaging",
    desc:"병리학 파운데이션 모델. TCGA 등 대규모 병리 이미지로 학습. 암 진단 분류 특화.",
    tags:["Pathology","Cancer","TCGA"], dl:"7.8K", likes:94, license:"CC BY-NC 4.0",
    hf:"https://huggingface.co/MahmoodLab/CONCH", visual:"pathologySlide" },
  { id:18, name:"UNI", org:"Harvard MGB", orgTag:"mit", size:"ViT-L", cat:"imaging",
    desc:"100,000+ WSI로 학습한 범용 병리학 파운데이션. 다양한 종양 유형 분류 SOTA.",
    tags:["Pathology","Universal","WSI"], dl:"6.2K", likes:71, license:"CC BY-NC 4.0",
    hf:"https://huggingface.co/MahmoodLab/UNI", visual:"cellSegment" },

  // ─────── STANFORD ────────────────────────────────────────
  { id:19, name:"BioMedLM", org:"Stanford CRFM", orgTag:"stanford", size:"2.7B", cat:"nlp",
    desc:"PubMed+PMC로 학습한 스탠퍼드 의료 LLM. MedQA(USMLE) SOTA. 상업 이용 가능.",
    tags:["GPT-2","MedQA","USMLE"], dl:"3.0K", likes:498, license:"Apache 2.0",
    hf:"https://huggingface.co/stanford-crfm/BioMedLM", visual:"neuronNet" },
  { id:20, name:"CheXpert Plus", org:"Stanford", orgTag:"stanford", size:"ViT-B", cat:"imaging",
    desc:"흉부 X-ray 14개 병변 분류. CheXpert 데이터셋 기반 방사선 진단 AI.",
    tags:["X-ray","Chest","14-class"], dl:"11.5K", likes:143, license:"Apache 2.0",
    hf:"https://huggingface.co/stanfordmlgroup/chexpert-pretrained", visual:"xrayLung" },

  // ─────── NVIDIA BioNeMo ───────────────────────────────────
  { id:21, name:"Evo 2 (40B)", org:"NVIDIA BioNeMo", orgTag:"nvidia", size:"40B", cat:"genomics",
    desc:"역대 최대 생물학 AI(40B). 모든 생명체 유전 코드 학습. 유전체 생성·예측·기능 분석.",
    tags:["Genomics","DNA","Foundation"], dl:"NGC", likes:0, license:"Apache 2.0",
    hf:"https://huggingface.co/arcinstitute/evo-2-40b", visual:"genomicSeq" },
  { id:22, name:"MolMIM", org:"NVIDIA BioNeMo", orgTag:"nvidia", size:"~200M", cat:"drug",
    desc:"소분자 약물 생성 AI. 분자 임베딩 및 신규 분자 설계. 신약 개발 스크리닝 가속화.",
    tags:["Drug","SMILES","Generative"], dl:"GitHub", likes:0, license:"Apache 2.0",
    github:"https://github.com/NVIDIA/bionemo-framework", visual:"moleculeNet" },
  { id:23, name:"ESM-2 (NVIDIA NIM)", org:"NVIDIA BioNeMo", orgTag:"nvidia", size:"3B", cat:"genomics",
    desc:"NVIDIA GPU 최적화 ESM-2 NIM. 고속 단백질 임베딩 인퍼런스. API 엔드포인트 제공.",
    tags:["NIM","Protein","GPU"], dl:"NGC", likes:0, license:"MIT",
    github:"https://github.com/NVIDIA/bionemo-framework", visual:"dnaHelix" },
  { id:24, name:"DiffDock", org:"NVIDIA / MIT", orgTag:"nvidia", size:"~50M", cat:"drug",
    desc:"확산 모델 기반 단백질-리간드 도킹. AlphaFold 구조에 약물 결합 위치 예측.",
    tags:["Docking","Diffusion","Drug"], dl:"3.8K", likes:67, license:"MIT",
    hf:"https://huggingface.co/nvidia/diffdock", visual:"drugTarget" },

  // ─────── OpenMed ─────────────────────────────────────────
  { id:25, name:"OpenMed NER Suite", org:"OpenMed", orgTag:"openmed", size:"380+ 모델", cat:"nlp",
    desc:"의약품·질병·증상 인식 380종 이상. 기존 SOTA 대비 36% 향상. 영구 무료 오픈소스.",
    tags:["NER","Pharma","Apache 2.0"], dl:"29.7M", likes:0, license:"Apache 2.0",
    hf:"https://huggingface.co/OpenMed", visual:"clinicalBert" },
  { id:26, name:"OpenBioLLM-70B", org:"OpenBioLLM / Aaditya", orgTag:"openmed", size:"70B", cat:"nlp",
    desc:"Llama3-70B 기반 의료 파인튜닝 최강자. 의료 자격시험 SOTA. 오픈 의료 LLM.",
    tags:["Llama3","70B","MedQA"], dl:"3.6K", likes:231, license:"Meta Llama 3",
    hf:"https://huggingface.co/aaditya/OpenBioLLM-Llama3-70B", visual:"neuronNet" },
  { id:27, name:"OpenBioLLM-8B", org:"OpenBioLLM", orgTag:"openmed", size:"8B", cat:"nlp",
    desc:"Llama3-8B 기반 의료 모델. 소형이지만 강력한 의료 지식. CPU에서도 실행 가능.",
    tags:["Llama3","8B","Efficient"], dl:"7.45K", likes:8, license:"Meta Llama 3",
    hf:"https://huggingface.co/aaditya/OpenBioLLM-Llama3-8B", visual:"clinicalBert" },

  // ─────── BioASQ / Community ───────────────────────────────
  { id:28, name:"Med42-v2 (70B)", org:"M42 Health AI", orgTag:"community", size:"70B", cat:"nlp",
    desc:"의료 임상 추론 특화 Llama3 파인튜닝. 의사 레벨 의료 지식 QA 성능.",
    tags:["Clinical","Reasoning","Llama3"], dl:"192", likes:15, license:"CC BY-NC 4.0",
    hf:"https://huggingface.co/m42-health/med42-70b", visual:"neuronNet" },
  { id:29, name:"Meditron-70B", org:"EPFL", orgTag:"community", size:"70B", cat:"nlp",
    desc:"스위스 EPFL 개발. 의료 가이드라인 및 임상 노트로 학습. 저소득 국가 의료 지원 목적.",
    tags:["Clinical","WHO","Guidelines"], dl:"46", likes:23, license:"Llama 2",
    hf:"https://huggingface.co/epfl-llm/meditron-70b", visual:"clinicalBert" },
  { id:30, name:"MedLlama3-v20", org:"ProbeMedicalYonseiAILab", orgTag:"community", size:"8B", cat:"nlp",
    desc:"한국 연세대학교 AI Lab 의료 LLM. 한국 의료 데이터로 추가 학습.",
    tags:["Korean","Yonsei","Medical"], dl:"7.45K", likes:8, license:"Meta Llama 3",
    hf:"https://huggingface.co/ProbeMedicalYonseiAILab/MedLlama3-v20", visual:"clinicalBert" },
  { id:31, name:"Llama3-OpenBioLLM-8B", org:"Aaditya Ura", orgTag:"community", size:"8B", cat:"nlp",
    desc:"경량 의료 LLM. 서버 없이 로컬 실행 가능. 임상 추론 및 의료 QA 특화.",
    tags:["Local","8B","Efficient"], dl:"8B", likes:8, license:"Llama 3",
    hf:"https://huggingface.co/aaditya/Llama3-OpenBioLLM-8B", visual:"clinicalBert" },
  { id:32, name:"RadBERT", org:"UCLA / Rady", orgTag:"community", size:"110M", cat:"nlp imaging",
    desc:"방사선과 보고서 특화 BERT. 방사선 이상 소견 추출, 긴급도 분류에 사용.",
    tags:["Radiology","BERT","Reports"], dl:"17.4K", likes:489, license:"Apache 2.0",
    hf:"https://huggingface.co/StanfordAIMI/RadBERT", visual:"clinicalBert" },
  { id:33, name:"BioViL-T", org:"Microsoft/Cambridge", orgTag:"ms", size:"ViT+BERT", cat:"multimodal imaging",
    desc:"시간적 흉부 X-ray 분석. 이전/현재 X-ray 비교로 변화 감지. 연속 진료 지원.",
    tags:["Temporal","X-ray","Change"], dl:"3.1K", likes:41, license:"MIT",
    hf:"https://huggingface.co/microsoft/BioViL-T", visual:"xrayLung" },

  // ─────── Google (more) ────────────────────────────────────
  { id:34, name:"CXR Foundation", org:"Google HAI-DEF", orgTag:"google", size:"ViT-B", cat:"imaging",
    desc:"흉부 X-ray 파운데이션 모델. 소량 레이블로 다양한 CXR 태스크 파인튜닝 가능.",
    tags:["CXR","Foundation","Google"], dl:"9.8K", likes:62, license:"Apache 2.0",
    hf:"https://huggingface.co/google/cxr-foundation", visual:"xrayLung" },
  { id:35, name:"Derm Foundation", org:"Google HAI-DEF", orgTag:"google", size:"ViT-B", cat:"imaging",
    desc:"피부과 이미지 임베딩 모델. 피부 병변 분류, 희귀 피부 질환 검출에 최적화.",
    tags:["Dermatology","Skin","Foundation"], dl:"4.2K", likes:35, license:"Apache 2.0",
    hf:"https://huggingface.co/google/derm-foundation", visual:"skinDerm" },
  { id:36, name:"REMEDIS CXR", org:"Google Research", orgTag:"google", size:"ViT-B", cat:"imaging",
    desc:"저소득 국가 의료 AI. 최소한의 레이블로 고성능 진단. 폐렴·결핵 검출.",
    tags:["LMICs","CXR","TB"], dl:"2.1K", likes:28, license:"Apache 2.0",
    hf:"https://huggingface.co/google/remedis-cxr", visual:"xrayLung" },

  // ─────── MONAI / Nvidia Medical ──────────────────────────
  { id:37, name:"MONAI Bundle - Spleen CT", org:"MONAI / Nvidia", orgTag:"nvidia", size:"UNet", cat:"imaging",
    desc:"비장 CT 자동 분할 MONAI 번들. 의료 이미지 분할 표준 프레임워크 MONAI.",
    tags:["Segmentation","CT","MONAI"], dl:"GitHub", likes:0, license:"Apache 2.0",
    github:"https://github.com/Project-MONAI/model-zoo", visual:"ctScan" },
  { id:38, name:"VISTA-2D", org:"NVIDIA MONAI", orgTag:"nvidia", size:"ViT-H", cat:"imaging",
    desc:"세포 이미지 인터랙티브 분할. SAM 기반 조직학 이미지 분할 모델.",
    tags:["Cell","Histology","SAM"], dl:"GitHub", likes:0, license:"Apache 2.0",
    github:"https://github.com/Project-MONAI/VISTA", visual:"cellSegment" },
  { id:39, name:"VISTA-3D", org:"NVIDIA MONAI", orgTag:"nvidia", size:"ViT", cat:"imaging",
    desc:"전신 3D CT 자동 분할. 117개 해부학 구조 동시 분할. 방사선 치료 계획 지원.",
    tags:["3D CT","117 classes","Anatomy"], dl:"GitHub", likes:0, license:"Apache 2.0",
    github:"https://github.com/Project-MONAI/VISTA", visual:"ctScan" },

  // ─────── Retinal / Eye ───────────────────────────────────
  { id:40, name:"RETFound", org:"Moorfields Eye", orgTag:"community", size:"ViT-L", cat:"imaging",
    desc:"망막 이미지 파운데이션 모델. 1.6M OCT 이미지 학습. 당뇨망막병증, 녹내장 검출.",
    tags:["Retinal","OCT","Foundation"], dl:"5.3K", likes:76, license:"CC BY-NC 4.0",
    hf:"https://huggingface.co/rmaphoh/RETFound_mae_meh", visual:"retinalScan" },
  { id:41, name:"VisionFM Eye", org:"Peking Union Hospital", orgTag:"community", size:"ViT-B", cat:"imaging",
    desc:"범용 안과 AI. 다중 촬영 장비 지원. 황반변성, 시신경 질환 다중 분류.",
    tags:["Ophthalmology","Fundus","Multi-modal"], dl:"1.8K", likes:22, license:"Apache 2.0",
    github:"https://github.com/usail-hkust/VisionFM", visual:"retinalScan" },

  // ─────── Cardiology ──────────────────────────────────────
  { id:42, name:"ECG-FM", org:"Cedars-Sinai", orgTag:"community", size:"~100M", cat:"imaging nlp",
    desc:"심전도(ECG) 파운데이션 모델. 1.5M ECG로 자기지도 학습. 부정맥 감지 SOTA.",
    tags:["ECG","Cardiology","Foundation"], dl:"2.9K", likes:34, license:"CC BY-NC 4.0",
    hf:"https://huggingface.co/Cedars-Sinai/ecg-fm", visual:"ecgWave" },
  { id:43, name:"CardioViLa", org:"Johns Hopkins", orgTag:"community", size:"ViT+BERT", cat:"multimodal",
    desc:"심장초음파 + 임상 노트 멀티모달. 심장 기능 평가 자동화. 심부전 예측.",
    tags:["Echo","Cardiology","VLP"], dl:"1.2K", likes:18, license:"MIT",
    github:"https://github.com/echonet/dynamic", visual:"ecgWave" },

  // ─────── Drug Discovery ──────────────────────────────────
  { id:44, name:"AlphaFold2 (HF)", org:"DeepMind / HF", orgTag:"google", size:"~93M", cat:"genomics drug",
    desc:"2021 노벨상 수준 단백질 구조 예측. 모든 인간 단백질 구조 데이터베이스 공개.",
    tags:["AlphaFold","Structure","Nobel"], dl:"83.2K", likes:405, license:"Apache 2.0",
    hf:"https://huggingface.co/facebook/esmfold_v1", visual:"proteinFold" },
  { id:45, name:"ChemBERTa-2", org:"Seyonec", orgTag:"community", size:"125M", cat:"drug",
    desc:"SMILES 화학식 학습 BERT. 분자 특성 예측, ADMET 예측, 약물 독성 분류.",
    tags:["SMILES","ADMET","Chemistry"], dl:"32.5K", likes:492, license:"MIT",
    hf:"https://huggingface.co/seyonec/ChemBERTa-zinc-base-v1", visual:"moleculeNet" },
  { id:46, name:"MolBERT", org:"BenevolentAI", orgTag:"community", size:"~110M", cat:"drug",
    desc:"분자 표현 학습 BERT. 분자 특성 예측, 약물 친화성 예측, 분자 유사도 검색.",
    tags:["BERT","Molecule","Properties"], dl:"3.0K", likes:498, license:"Apache 2.0",
    hf:"https://huggingface.co/seyonec/PubChem10M_SMILES_BPE_396_250", visual:"moleculeNet" },
  { id:47, name:"ProGen2", org:"Salesforce AI", orgTag:"community", size:"151M~6.4B", cat:"drug genomics",
    desc:"단백질 시퀀스 생성 모델. 새로운 단백질 기능 설계. 항체 최적화에 활용.",
    tags:["Protein Gen","Antibody","Design"], dl:"1.3K", likes:231, license:"Apache 2.0",
    hf:"https://huggingface.co/hugohrban/progen2-base", visual:"dnaHelix" },

  // ─────── Genomics ─────────────────────────────────────────
  { id:48, name:"Nucleotide Transformer", org:"InstaDeep/EMBL", orgTag:"community", size:"500M~2.5B", cat:"genomics",
    desc:"DNA 서열 파운데이션 모델. 3,202 인간 게놈 학습. 유전자 발현, 조절 요소 예측.",
    tags:["DNA","Genome","Foundation"], dl:"8.7K", likes:118, license:"Apache 2.0",
    hf:"https://huggingface.co/InstaDeepAI/nucleotide-transformer-2.5b-multi-species", visual:"genomicSeq" },
  { id:49, name:"Geneformer", org:"Broad Institute", orgTag:"community", size:"~10M", cat:"genomics",
    desc:"단세포 전사체 파운데이션 모델. 30M 세포 학습. 유전자 조절 네트워크 예측.",
    tags:["scRNA","Single-cell","Transcriptome"], dl:"3.1K", likes:41, license:"CC BY-NC-SA 4.0",
    hf:"https://huggingface.co/ctheodoris/Geneformer", visual:"microbiome" },
  { id:50, name:"DNABERT-2", org:"UIUC", orgTag:"community", size:"117M", cat:"genomics",
    desc:"다종 DNA 서열 학습 BERT-2. 단일염기다형성(SNP), 전사인자 결합 부위 예측.",
    tags:["DNA","BERT","Multi-species"], dl:"4.8K", likes:62, license:"Apache 2.0",
    hf:"https://huggingface.co/zhihan1996/DNABERT-2-117M", visual:"genomicSeq" },

  // ─────── Pathology ────────────────────────────────────────
  { id:51, name:"H-optimus-0", org:"Owkin", orgTag:"community", size:"1.1B ViT-g", cat:"imaging",
    desc:"500K H&E 슬라이드로 학습한 1.1B ViT. 역대 최대 규모 병리학 파운데이션 모델.",
    tags:["Pathology","H&E","ViT-g"], dl:"1.5K", likes:32, license:"Apache 2.0",
    hf:"https://huggingface.co/bioptimus/H-optimus-0", visual:"pathologySlide" },
  { id:52, name:"PLIP", org:"Mahmood Lab", orgTag:"community", size:"ViT-B", cat:"multimodal imaging",
    desc:"병리 이미지-텍스트 쌍 학습 CLIP. 트위터 병리학 커뮤니티 데이터 활용. 제로샷 분류.",
    tags:["CLIP","Pathology","Twitter"], dl:"2.4K", likes:44, license:"CC BY-NC 4.0",
    hf:"https://huggingface.co/MahmoodLab/plip", visual:"pathologySlide" },

  // ─────── Multimodal / Misc ────────────────────────────────
  { id:53, name:"BioViL", org:"Microsoft/Cambridge", orgTag:"ms", size:"ViT+BERT", cat:"multimodal imaging",
    desc:"방사선 보고서-이미지 대조 학습. 흉부 X-ray 시각적 근거 식별. Report grounding.",
    tags:["CXR","Grounding","BERT"], dl:"5.7K", likes:78, license:"MIT",
    hf:"https://huggingface.co/microsoft/BioViL", visual:"xrayLung" },
  { id:54, name:"GatorTron", org:"UF Health / NVIDIA", orgTag:"nvidia", size:"8.9B", cat:"nlp",
    desc:"임상 노트 90억 단어 학습 대규모 GPT. 임상 NLP 5개 태스크 동시 SOTA.",
    tags:["GPT","Clinical Notes","EHR"], dl:"3.0K", likes:498, license:"Apache 2.0",
    hf:"https://huggingface.co/UFNLP/gatortron-base", visual:"clinicalBert" },
  { id:55, name:"MedImageInsight", org:"Microsoft Research", orgTag:"ms", size:"ViT-B", cat:"multimodal imaging",
    desc:"의료 이미지 범용 임베딩 모델. 13개 의료 이미지 모달리티 지원. 제로샷 진단.",
    tags:["Universal","13 modalities","Zero-shot"], dl:"2.69K", likes:41, license:"MIT",
    hf:"https://huggingface.co/microsoft/MedImageInsight", visual:"heatmap" },
  { id:56, name:"BioLlama 3B", org:"Realec", orgTag:"community", size:"3B", cat:"nlp",
    desc:"경량 의료 Llama 모델. 노트북에서 실행 가능한 의료 AI. PubMed QA 특화.",
    tags:["Llama","3B","Lightweight"], dl:"2.63K", likes:144, license:"MIT",
    hf:"https://huggingface.co/realec/BioLlama-3B", visual:"clinicalBert" },
];

// ── ORG STYLES ────────────────────────────────────────────

// ── ORG STYLES (light theme) ──────────────────────────────
const orgStyles = {
  google:    { logo:"G",  color:"#2e7d46", bg:"rgba(46,125,70,.1)",   border:"rgba(46,125,70,.22)",   tagBg:"rgba(46,125,70,.08)",   tagColor:"#2e7d46"  },
  ms:        { logo:"MS", color:"#2f8f6a", bg:"rgba(47,143,106,.1)",  border:"rgba(47,143,106,.22)",  tagBg:"rgba(47,143,106,.08)",  tagColor:"#2f8f6a"  },
  meta:      { logo:"M",  color:"#45846a", bg:"rgba(69,132,106,.1)",  border:"rgba(69,132,106,.22)",  tagBg:"rgba(69,132,106,.08)",  tagColor:"#45846a"  },
  mit:       { logo:"M",  color:"#5a7d3a", bg:"rgba(90,125,58,.1)",   border:"rgba(90,125,58,.22)",   tagBg:"rgba(90,125,58,.08)",   tagColor:"#5a7d3a"  },
  stanford:  { logo:"S",  color:"#7a8a3a", bg:"rgba(122,138,58,.1)",  border:"rgba(122,138,58,.22)",  tagBg:"rgba(122,138,58,.08)",  tagColor:"#7a8a3a"  },
  nvidia:    { logo:"N",  color:"#4a7c2e", bg:"rgba(74,124,46,.1)",   border:"rgba(74,124,46,.22)",   tagBg:"rgba(74,124,46,.08)",   tagColor:"#4a7c2e"  },
  openmed:   { logo:"O",  color:"#3a8a7a", bg:"rgba(58,138,122,.1)",  border:"rgba(58,138,122,.22)",  tagBg:"rgba(58,138,122,.08)",  tagColor:"#3a8a7a"  },
  community: { logo:"C",  color:"#5f7d52", bg:"rgba(95,125,82,.1)",   border:"rgba(95,125,82,.22)",  tagBg:"rgba(95,125,82,.08)",  tagColor:"#5f7d52"  },
};
const srcBadge = { hf:"🤗 HF", github:"⚡ GitHub", nvidia:"⚡ NGC" };

// ── CARD BUILDER ──────────────────────────────────────────
function buildCard(m) {
  const s = orgStyles[m.orgTag] || orgStyles.community;
  const src = m.hf ? "hf" : m.github ? "github" : "nvidia";
  const url = m.hf || m.github || "#";
  const svg = visuals[m.visual] || visuals.neuronNet;
  return `<div class="mcard" data-category="${m.cat}" data-name="${m.name.toLowerCase()} ${m.org.toLowerCase()} ${m.tags.join(' ').toLowerCase()}">
  <div class="mcard-visual">${svg}</div>
  <div class="mcard-body">
    <div class="mcard-header">
      <div class="mcard-logo" style="background:${s.bg};border-color:${s.border};color:${s.color}">${s.logo}</div>
      <div class="mcard-meta">
        <span class="mcard-org" style="background:${s.tagBg};color:${s.color}">${m.org}</span>
        <span class="mcard-size">${m.size}</span>
      </div>
      <div class="mcard-badges">
        <span class="mbadge mbadge-free">무료</span>
        <span class="mbadge mbadge-src">${srcBadge[src]}</span>
      </div>
    </div>
    <h3 class="mcard-name">${m.name}</h3>
    <p class="mcard-desc">${m.desc}</p>
    <div class="mcard-tags">${m.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    <div class="mcard-stats">
      <span>⬇️ ${m.dl}</span>
      ${m.likes ? `<span>❤️ ${m.likes}</span>` : ''}
      <span class="mcard-license">${m.license}</span>
    </div>
    <div class="mcard-actions">
      <a href="${url}" target="_blank" rel="noopener" class="btn-dl-pri">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        다운로드
      </a>
      <a href="${url}" target="_blank" rel="noopener" class="btn-dl-sec">모델 카드</a>
    </div>
  </div>
</div>`;
}

// ── RENDER ────────────────────────────────────────────────
function renderModels(list) {
  const grid = document.getElementById('modelsGrid');
  if (!grid) return;
  grid.innerHTML = list.map(buildCard).join('');
  const countEl = document.getElementById('count-all');
  if (countEl) countEl.textContent = list.length;
}

// ── FILTER ────────────────────────────────────────────────
function applyFilter(filter) {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  let list = MODELS;
  if (filter !== 'all') list = list.filter(m => m.cat.includes(filter));
  if (q) list = list.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.org.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q)) ||
    m.desc.toLowerCase().includes(q)
  );
  renderModels(list);
}

let activeFilter = 'all';

// Category cards
document.querySelectorAll('.cat-card').forEach(card => {
  card.addEventListener('click', () => {
    activeFilter = card.dataset.filter;
    applyFilter(activeFilter);
    document.getElementById('models-section')?.scrollIntoView({behavior:'smooth'});
  });
});

// Navbar quick filter
document.querySelectorAll('[data-quickfilter]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    activeFilter = el.dataset.quickfilter;
    applyFilter(activeFilter);
    document.getElementById('models-section')?.scrollIntoView({behavior:'smooth'});
  });
});

// Nav search input
document.getElementById('searchInput')?.addEventListener('input', () => applyFilter(activeFilter));

// Hero search event
window.addEventListener('heroSearch', e => {
  const si = document.getElementById('searchInput');
  if (si) si.value = e.detail;
  applyFilter(activeFilter);
});

// Keyboard shortcut /
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('searchInput')?.focus();
  }
});

// Init
renderModels(MODELS);
