#!/usr/bin/env python3
"""차트 프롬프트 A/B 비교 — 같은 전사(fw-turbo)로 SageFM 호출.

A = 현행 adapter.build_prompt(standard)
B = 병합안(운영 SOAP 프롬프트 골격 + 어댑터 고유 장치)
결과는 results/prompt-A.txt / prompt-B.txt 로 저장.
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, '/home/nump/Basil_Nexus/medipencil/sagefm-adapter')
import adapter  # build_prompt, ask_sagefm 재사용  # noqa: E402

text = json.load(open(os.path.join(BASE, 'results', 'fw-turbo.json')))['text']
form = {'lengthInstruction': '3', 'useAbbreviation': 'false', 'userDept': '내과'}

prompt_a = adapter.build_prompt('standard', text, form)

MERGED_RULES = """너는 의무기록 작성을 돕는 전문 의료기록사다.
아래 진료 대화(음성 인식 전사)를 병원용 SOAP 노트로 정리하라. 한국어로 작성하라.
섹션 제목은 'S - Subjective', 'O - Objective', 'A - Assessment', 'P - Plan' 으로 영문 그대로 쓰고, 각 섹션 내용은 한국어로 적는다.
각 섹션 내용은 항목별로 줄을 바꾸어 '* ...했음.' 형식의 개조식으로 간결히 적는다. 설명적인 줄글 금지.
대화에 나온 증상 설명(발병/경과·부위·정도·동반증상·악화/완화 인자·음성 ROS), 관련 병력·복약·알레르기·사회력·가족력, 의사가 언급한 검사·처방·교육·추적 계획은 누락 없이 모두 별도 항목으로 적는다.
단, 대화에 없는 내용을 추측하거나 지어내지 마라. 완전성보다 이 규칙이 우선한다.
S에는 환자가 말한 주관적 정보(증상·병력·환자 진술)를 적고, O에는 의사가 실제로 측정·관찰·진찰·검사한 객관적 소견만 적는다. 대화에 객관적 소견이 없으면 O는 '* 특이사항 없음.' 한 줄로 두며, 환자 진술이나 향후 계획을 O에 넣지 마라.
P의 마지막에는 대화 맥락에 맞는 경고 증상 복귀 지침을 한 항목 넣는다.
의학 전문용어는 한글 표기 뒤 괄호로 영어를 병기하고(예: 당뇨병성 말초신경병증(diabetic peripheral neuropathy)) 영어를 먼저 쓰지 마라.
분량은 상세하게, 대화에 있는 임상 정보를 빠짐없이 담아라.
SOAP 4섹션을 모두 작성한 뒤 한 줄 띄우고 다음 구분선을 두어라:
--- 진료보조정보 (사적 대화 메모)
그 아래에는 대화 중 등장한 '임상 정보와 무관한 환자의 사적·일상 단서'만 '* ...' 개조식으로 짧게 적는다. 증상·진단·약물·검사·복약 순응 같은 임상 정보는 모두 SOAP 안에 적고 이 섹션에는 절대 적지 마라. 사적 단서가 정말 없으면 '* 없음' 한 줄.
머리말·꼬리말·설명 없이 위 형식만 출력하라.
참고 배경 — 진료과: 내과 (출력에 다시 쓰지 마라)"""

prompt_b = MERGED_RULES + '\n\n[진료 대화]\n' + text

for name, p in (('A', prompt_a), ('B', prompt_b)):
    out = adapter.ask_sagefm(p)
    open(os.path.join(BASE, 'results', f'prompt-{name}.txt'), 'w').write(out)
    print(f'===== 프롬프트 {name} 결과 ({len(out)}자) =====')
    print(out)
    print()
