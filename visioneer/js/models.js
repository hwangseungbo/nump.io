/* Visioneer — medical imaging / vision model hub data
   각 모델: { name, org, task, modality, params, license, link, visual, desc, tags } */

/* ── 작업(task) · 모달리티 메타 ───────────────────────────── */
const TASKS = {
  segmentation:   { label:"세그멘테이션", icon:"🧩", desc:"장기·병변 픽셀 단위 구획" },
  detection:      { label:"검출",         icon:"🎯", desc:"병변 위치를 박스로 표시" },
  classification: { label:"분류",         icon:"🏷", desc:"영상을 질환·등급으로 판정" },
  foundation:     { label:"파운데이션",   icon:"🧠", desc:"사전학습 범용 백본" },
  multimodal:     { label:"멀티모달",     icon:"💬", desc:"영상+텍스트 이해·판독문" },
  restoration:    { label:"복원·정밀화",  icon:"✨", desc:"노이즈 제거·재구성·화질향상" },
};
const MODALITIES = {
  xray:"X-ray", ct:"CT", mri:"MRI", ultrasound:"초음파",
  pathology:"병리", retina:"안저", derm:"피부", endoscopy:"내시경", multi:"범용",
};

/* ── 카드 썸네일: 모달리티별 실제 의료영상(배경) + 작업(task) 오버레이 ── */
const MODALITY_IMG = {
  xray:"assets/img/xray.jpg", ct:"assets/img/ct.jpg", mri:"assets/img/mri.jpg",
  ultrasound:"assets/img/ultrasound.jpg", pathology:"assets/img/pathology.jpg",
  retina:"assets/img/retina.jpg", derm:"assets/img/derm.jpg", endoscopy:"assets/img/endoscopy.jpg",
};
// 범용(multi) 모델은 대표 모달리티 영상을 번갈아 사용
const MULTI_IMG = ["assets/img/xray.jpg","assets/img/ct.jpg","assets/img/mri.jpg","assets/img/pathology.jpg"];

// 작업별 투명 오버레이 (배경 영상 위에 얹힘). preserveAspectRatio=none → 카드에 꽉 맞춤
const O = (inner) => `<svg class="ovl" viewBox="0 0 320 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const OVERLAYS = {
  segmentation: O(`<path d="M102 66q-32 38 4 80q36 30 72 4q28-36 4-74q-36-30-80-10z" fill="#22d3ee" fill-opacity=".20" stroke="#22d3ee" stroke-width="3" stroke-dasharray="8 5"/><circle cx="150" cy="104" r="3.5" fill="#fff"/>`),
  detection: O(`<rect x="92" y="58" width="96" height="86" fill="none" stroke="#fbbf24" stroke-width="3"/><rect x="92" y="44" width="78" height="15" fill="#fbbf24"/><text x="97" y="56" font-size="11.5" font-family="monospace" fill="#0b1b30">lesion 0.94</text><rect x="198" y="96" width="66" height="56" fill="none" stroke="#22d3ee" stroke-width="3"/><rect x="198" y="84" width="50" height="13" fill="#22d3ee"/><text x="202" y="94" font-size="10" font-family="monospace" fill="#0b1b30">mass .88</text>`),
  classification: O(`<ellipse cx="150" cy="90" rx="80" ry="64" fill="#fbbf24" fill-opacity=".14"/><ellipse cx="150" cy="90" rx="54" ry="44" fill="#fb923c" fill-opacity=".20"/><ellipse cx="150" cy="90" rx="30" ry="24" fill="#f97316" fill-opacity=".30"/><rect x="0" y="166" width="320" height="34" fill="#0b1b30" fill-opacity=".64"/><text x="14" y="188" font-size="14" font-family="monospace" fill="#fbbf24">● class: positive · 0.92</text>`),
  foundation: O(`${Array.from({length:24}).map((_,i)=>{const x=40+(i%8)*32,y=42+Math.floor(i/8)*40,o=(0.12+((i*29)%50)/100).toFixed(2);return `<rect x="${x}" y="${y}" width="24" height="30" rx="4" fill="#38bdf8" fill-opacity="${o}"/>`;}).join("")}<circle cx="160" cy="100" r="92" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="5 6" opacity=".7"/>`),
  multimodal: O(`<circle cx="116" cy="100" r="10" fill="none" stroke="#22d3ee" stroke-width="2.5"/><line x1="126" y1="100" x2="176" y2="100" stroke="#22d3ee" stroke-width="2" stroke-dasharray="4 3"/><rect x="176" y="40" width="134" height="120" rx="10" fill="#0b1b30" fill-opacity=".60"/><g fill="#38bdf8"><rect x="188" y="56" width="104" height="9" rx="4"/><rect x="188" y="76" width="86" height="9" rx="4" fill-opacity=".75"/><rect x="188" y="96" width="98" height="9" rx="4" fill-opacity=".6"/><rect x="188" y="116" width="64" height="9" rx="4" fill-opacity=".45"/></g><text x="188" y="148" font-size="11" font-family="monospace" fill="#22d3ee">"흉부 정상 소견…"</text>`),
  restoration: O(`<line x1="160" y1="0" x2="160" y2="200" stroke="#22d3ee" stroke-width="2.5" stroke-dasharray="7 5"/><path d="M252 40l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="#22d3ee"/><rect x="8" y="166" width="66" height="26" rx="6" fill="#0b1b30" fill-opacity=".6"/><text x="17" y="184" font-size="12" font-family="monospace" fill="#9fc0e6">noisy</text><rect x="232" y="166" width="84" height="26" rx="6" fill="#0b1b30" fill-opacity=".6"/><text x="241" y="184" font-size="12" font-family="monospace" fill="#22d3ee">restored</text>`),
};

// 이미지 출처/라이선스 (Wikimedia Commons) — CC 저작자 표시용
const IMAGE_CREDITS = [
  { mod:"X-ray",   title:"Normal PA chest radiograph",       author:"Mikael Häggström", license:"CC0",         url:"https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_(PA)_chest_radiograph_(X-ray).jpg" },
  { mod:"CT",      title:"HRCT of normal thorax (axial)",    author:"Mikael Häggström", license:"CC0",         url:"https://commons.wikimedia.org/wiki/File:High-resolution_computed_tomograph_of_a_normal_thorax,_axial_plane_(86).jpg" },
  { mod:"MRI",     title:"T2 axial brain MRI",               author:"Cerevisae",        license:"CC BY-SA 4.0", url:"https://commons.wikimedia.org/wiki/File:T2_weighted_axial_section_of_MRI_brain_showing_cystic_encephalomyelitic_changes_of_right_cerebellum.jpg" },
  { mod:"초음파",  title:"Fetal ultrasound (CRL 12w)",       author:"Wolfgang Moroder", license:"CC BY-SA 3.0", url:"https://commons.wikimedia.org/wiki/File:CRL_Crown_rump_length_12_weeks_ecografia_Dr._Wolfgang_Moroder.jpg" },
  { mod:"병리",    title:"H&E photomicrograph",              author:"Soca1zim",         license:"CC BY-SA 3.0", url:"https://commons.wikimedia.org/wiki/File:Hematoxylin_and_Eosin_stained_photomicrograph_of_an_elastofibroma_LDRT.jpg" },
  { mod:"안저",    title:"Fundus photograph (retina)",       author:"Ktkvtsh",          license:"CC BY-SA 4.0", url:"https://commons.wikimedia.org/wiki/File:Fundus_photograph_Retina_OS.jpg" },
  { mod:"피부",    title:"Dermatoscopy of nevus",            author:"Philipp Tschandl",  license:"CC BY-SA 4.0", url:"https://commons.wikimedia.org/wiki/File:Dermatoscopy_Nevus_Reticular.jpg" },
  { mod:"내시경",  title:"Tubulovillous colonic polyp",      author:"Unknown",          license:"Public domain", url:"https://commons.wikimedia.org/wiki/File:Tubulovillous_Polyp_of_the_Colon_1.jpg" },
];

/* ── 모델 목록 (실제 공개 모델 기반) ─────────────────────── */
const MODELS = [
  // Segmentation
  { name:"nnU-Net", org:"DKFZ", task:"segmentation", modality:"ct", params:"자동구성", license:"Apache-2.0", visual:"segCT",
    link:"https://github.com/MIC-DKFZ/nnUNet", desc:"데이터셋에 맞춰 파이프라인을 자동 구성하는 의료영상 분할의 사실상 표준 베이스라인.", tags:["분할","CT","MRI","SOTA"] },
  { name:"MedSAM", org:"Bowang Lab", task:"segmentation", modality:"multi", params:"~90M", license:"Apache-2.0", visual:"segMask",
    link:"https://github.com/bowang-lab/MedSAM", desc:"SAM을 100만+ 의료영상으로 파인튜닝한 범용 프롬프트 분할 모델.", tags:["분할","범용","프롬프트"] },
  { name:"TotalSegmentator", org:"Univ. Basel", task:"segmentation", modality:"ct", params:"nnU-Net 기반", license:"Apache-2.0", visual:"segAbd",
    link:"https://github.com/wasserth/TotalSegmentator", desc:"전신 CT에서 117개 해부학적 구조를 한 번에 자동 분할.", tags:["분할","CT","전신","117구조"] },
  { name:"SAM-Med2D", org:"OpenGVLab", task:"segmentation", modality:"multi", params:"~91M", license:"Apache-2.0", visual:"segMask",
    link:"https://github.com/OpenGVLab/SAM-Med2D", desc:"2D 의료영상에 특화해 어댑터로 튜닝한 SAM 분할 모델.", tags:["분할","2D","프롬프트"] },
  { name:"Swin-UNETR", org:"NVIDIA · MONAI", task:"segmentation", modality:"mri", params:"~62M", license:"Apache-2.0", visual:"segBrain",
    link:"https://github.com/Project-MONAI/research-contributions", desc:"Swin Transformer 인코더 기반 3D 뇌·장기 분할 모델.", tags:["분할","3D","Transformer","MRI"] },
  { name:"MONAI Bundles", org:"Project MONAI", task:"segmentation", modality:"multi", params:"다양", license:"Apache-2.0", visual:"segAbd",
    link:"https://github.com/Project-MONAI/model-zoo", desc:"바로 쓰는 분할·분류 사전학습 번들 모음(모델 주). PyTorch 기반.", tags:["분할","모델주","번들"] },

  // Detection
  { name:"nnDetection", org:"DKFZ", task:"detection", modality:"ct", params:"자동구성", license:"Apache-2.0", visual:"detNodule",
    link:"https://github.com/MIC-DKFZ/nnDetection", desc:"nnU-Net 철학을 검출에 적용한 자가구성 3D 병변 검출 프레임워크.", tags:["검출","3D","CT","자동구성"] },
  { name:"Ultralytics YOLO", org:"Ultralytics", task:"detection", modality:"multi", params:"3M~68M", license:"AGPL-3.0", visual:"detBox",
    link:"https://github.com/ultralytics/ultralytics", desc:"실시간 객체 검출의 대표주자. 결절·골절 등 병변 검출에 널리 파인튜닝됨.", tags:["검출","실시간","박스"] },
  { name:"DETR", org:"Meta AI", task:"detection", modality:"multi", params:"~41M", license:"Apache-2.0", visual:"detBox",
    link:"https://huggingface.co/facebook/detr-resnet-50", desc:"Transformer 기반 종단간 객체 검출. 의료 병변 검출 베이스라인으로 활용.", tags:["검출","Transformer"] },

  // Classification
  { name:"TorchXRayVision", org:"MILA · mlmed", task:"classification", modality:"xray", params:"DenseNet-121", license:"Apache-2.0", visual:"clsCXR",
    link:"https://github.com/mlmed/torchxrayvision", desc:"여러 공개 데이터로 학습된 흉부 X-ray 다중 소견 분류 모델 라이브러리.", tags:["분류","X-ray","다중라벨"] },
  { name:"CheXNet", org:"Stanford ML", task:"classification", modality:"xray", params:"DenseNet-121", license:"MIT", visual:"clsCXR",
    link:"https://github.com/arnoweng/CheXNet", desc:"흉부 X-ray에서 폐렴 등 14개 흉부 질환을 분류하는 대표 모델.", tags:["분류","X-ray","폐렴"] },
  { name:"DR Grading (APTOS)", org:"Community", task:"classification", modality:"retina", params:"EfficientNet", license:"MIT", visual:"retina",
    link:"https://huggingface.co/models?search=diabetic%20retinopathy", desc:"안저 영상으로 당뇨망막병증 중증도를 0–4단계로 등급화.", tags:["분류","안저","등급"] },
  { name:"Derm Classifier", org:"Community", task:"classification", modality:"derm", params:"EfficientNet", license:"MIT", visual:"clsDerm",
    link:"https://huggingface.co/models?search=skin%20cancer", desc:"더모스코피 영상으로 피부 병변의 양성·악성(흑색종 등)을 분류.", tags:["분류","피부","흑색종"] },

  // Foundation
  { name:"RAD-DINO", org:"Microsoft", task:"foundation", modality:"xray", params:"ViT-B", license:"MSRLA", visual:"foundation",
    link:"https://huggingface.co/microsoft/rad-dino", desc:"DINOv2 자기지도로 흉부 X-ray를 사전학습한 영상 인코더(백본).", tags:["파운데이션","X-ray","자기지도"] },
  { name:"BiomedCLIP", org:"Microsoft", task:"foundation", modality:"multi", params:"ViT-B/16", license:"MIT", visual:"foundation",
    link:"https://huggingface.co/microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224", desc:"바이오메디컬 영상–텍스트 쌍으로 학습한 CLIP. 제로샷 분류·검색.", tags:["파운데이션","CLIP","제로샷"] },
  { name:"MedSigLIP", org:"Google", task:"foundation", modality:"multi", params:"SigLIP-SO400m", license:"Apache-2.0", visual:"foundation",
    link:"https://huggingface.co/google/medsiglip-so400m-patch14-224", desc:"의료 영상–텍스트 정렬 SigLIP 백본. 분류·검색·검수에 활용.", tags:["파운데이션","SigLIP","정렬"] },
  { name:"UNI", org:"Mahmood Lab", task:"foundation", modality:"pathology", params:"ViT-L", license:"CC-BY-NC", visual:"pathology",
    link:"https://huggingface.co/MahmoodLab/UNI", desc:"10만+ 슬라이드로 학습한 병리(조직) 영상 파운데이션 백본.", tags:["파운데이션","병리","WSI"] },
  { name:"CONCH", org:"Mahmood Lab", task:"foundation", modality:"pathology", params:"ViT-B", license:"CC-BY-NC", visual:"pathology",
    link:"https://huggingface.co/MahmoodLab/CONCH", desc:"병리 영상–캡션 대조학습 모델. 제로샷 병리 분류·검색.", tags:["파운데이션","병리","대조학습"] },
  { name:"Virchow", org:"Paige AI", task:"foundation", modality:"pathology", params:"ViT-H", license:"Apache-2.0", visual:"pathology",
    link:"https://huggingface.co/paige-ai/Virchow", desc:"150만 슬라이드 규모로 학습한 대형 병리 파운데이션 모델.", tags:["파운데이션","병리","대형"] },
  { name:"RETFound", org:"Moorfields · UCL", task:"foundation", modality:"retina", params:"ViT-L (MAE)", license:"CC-BY-NC", visual:"retina",
    link:"https://github.com/rmaphoh/RETFound_MAE", desc:"안저·OCT 영상 마스크드 오토인코더 파운데이션. 다양한 안질환 다운스트림.", tags:["파운데이션","안저","MAE"] },

  // Multimodal (영상+텍스트)
  { name:"MedGemma", org:"Google", task:"multimodal", modality:"multi", params:"4B / 27B", license:"Health AI Dev", visual:"multimodal",
    link:"https://huggingface.co/google/medgemma-4b-it", desc:"영상 이해가 가능한 의료 특화 멀티모달 LLM(Gemma 기반).", tags:["멀티모달","VLM","판독"] },
  { name:"LLaVA-Med", org:"Microsoft", task:"multimodal", modality:"multi", params:"7B", license:"MSRLA", visual:"multimodal",
    link:"https://github.com/microsoft/LLaVA-Med", desc:"의료 영상에 대해 대화·질의응답하는 비전-언어 어시스턴트.", tags:["멀티모달","VQA","대화"] },
  { name:"CheXagent", org:"Stanford AIMI", task:"multimodal", modality:"xray", params:"8B", license:"오픈", visual:"multimodal",
    link:"https://huggingface.co/StanfordAIMI/CheXagent-8b", desc:"흉부 X-ray 해석·판독문 생성에 특화한 파운데이션 비전-언어 모델.", tags:["멀티모달","X-ray","판독문"] },
  { name:"RadFM", org:"SJTU", task:"multimodal", modality:"multi", params:"14B", license:"오픈", visual:"multimodal",
    link:"https://github.com/chaoyi-wu/RadFM", desc:"2D·3D 방사선 영상을 함께 다루는 범용 방사선 파운데이션 모델.", tags:["멀티모달","3D","방사선"] },

  // Ultrasound / Endoscopy
  { name:"EchoNet-Dynamic", org:"Stanford", task:"segmentation", modality:"ultrasound", params:"~10M", license:"비상업", visual:"ultrasound",
    link:"https://github.com/echonet/dynamic", desc:"심장 초음파 영상에서 좌심실을 분할하고 박출률(EF)을 자동 추정.", tags:["분할","초음파","심장"] },
  { name:"Polyp Detector (Kvasir)", org:"Simula · Community", task:"detection", modality:"endoscopy", params:"YOLO 기반", license:"오픈", visual:"endo",
    link:"https://huggingface.co/models?search=polyp", desc:"대장내시경 영상에서 용종(polyp)을 실시간으로 검출.", tags:["검출","내시경","용종"] },

  // Restoration / Enhancement (정밀화)
  { name:"fastMRI", org:"Meta · NYU", task:"restoration", modality:"mri", params:"U-Net/VarNet", license:"MIT", visual:"restore",
    link:"https://github.com/facebookresearch/fastMRI", desc:"적은 데이터로 MRI를 가속 재구성하는 모델·데이터셋. 촬영시간 단축.", tags:["복원","MRI","가속"] },
  { name:"RED-CNN", org:"Open Source", task:"restoration", modality:"ct", params:"~1.8M", license:"MIT", visual:"restore",
    link:"https://github.com/SSinyu/RED-CNN", desc:"저선량 CT의 노이즈를 제거해 표준선량 화질로 복원하는 인코더-디코더 CNN.", tags:["복원","CT","저선량"] },
];
