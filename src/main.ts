import './styles.css';

/* =====================================================================
 * 타입
 * ===================================================================== */
type Severity = 'mild' | 'watch' | 'same-day' | 'urgent';
type BodyPart = 'knee' | 'ankle' | 'other' | '';
type Choice = 'yes' | 'no' | 'unknown';
type Tier = 'strong' | 'partial' | 'refer';

interface SpeechRecognitionLike { lang:string; continuous:boolean; interimResults:boolean; onstart:()=>void; onresult:(event:SpeechRecognitionEventLike)=>void; onend:()=>void; onerror:(event:SpeechRecognitionErrorEventLike)=>void; start:()=>void; stop:()=>void }
interface SpeechRecognitionEventLike { resultIndex:number; results:{ [index:number]:{ 0:{ transcript:string }; isFinal:boolean }; length:number } }
interface SpeechRecognitionErrorEventLike { error:string }
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface Option { id:string; label:string; icon:string }

/* ---- 감별 질문 엔진 노드 ----
 * QuestionNode: 하나의 질문. branch 에 답변별 다음 노드(id 문자열 참조 또는 인라인 Outcome)를 지정한다.
 * OutcomeNode: 더 이상 물을 것이 없을 때의 결과. 후보 손상 목록 + 근거를 담는다.
 * "모르겠어요"는 절대 "아니요"로 취급하지 않고 별도 분기(unknown)를 반드시 둔다.
 */
interface ResultRef { patternId:string; tier:Tier; note:string }
interface OutcomeNode { kind:'outcome'; results:ResultRef[]; fallbackNote?:string }
interface QuestionNode {
  kind:'question';
  id:string;
  prompt:string;
  hint?:string;
  multi?:Option[]; // 지정하면 yes/no/unknown 대신 다중 선택지 사용 (branch 키 = 선택지 id)
  yesLabel?:string; noLabel?:string; unknownLabel?:string;
  branch:Record<string, BranchTarget>;
}
type BranchTarget = string | OutcomeNode;
type EngineNode = QuestionNode | OutcomeNode;

interface InjuryInfo { name:string; specialty:string; confirm:string; urgent?:boolean }

interface InjuryState {
  story:string;
  part:BodyPart;
  moi:string;
  location:string;
  pain:number;
  redFlags:{ deformity:Choice; weightBearing:Choice; sensation:Choice; locking:Choice };
  engineCurrent:EngineNode|null;
  engineHistory:EngineNode[];
  engineAnswers:{ prompt:string; answer:string }[];
  engineOutcome:OutcomeNode|null;
}
interface Candidate { name:string; confidence:string; reason:string; confirm:string; urgent?:boolean }
interface Assessment { severity:Severity; title:string; summary:string; candidates:Candidate[]; specialty:string; urgentSignals:string[] }

/* =====================================================================
 * Q1(부위) 다음의 Q2(손상 기전) · Q3(통증 위치) 선택지
 * 자료(PDF)에 나온 MOI를 최대한 그대로 반영해, 특정 손상을 예단해 선택지를 줄이지 않는다.
 * ===================================================================== */
const KNEE_MOI:Option[] = [
 {id:'impact',label:'다른 사람·물체와 부딪히거나 충격을 받았을 때',icon:'💥'},
 {id:'twist',label:'발이 고정된 상태에서 몸이나 무릎을 비틀었을 때',icon:'↻'},
 {id:'stop_cut',label:'달리다가 급정지하거나 방향을 바꿨을 때',icon:'⛔'},
 {id:'hyperextend',label:'무릎이 뒤로 과하게 펴졌을 때',icon:'⇤'},
 {id:'fall_bent',label:'무릎을 굽힌 상태로 넘어졌을 때',icon:'↺'},
 {id:'daily_repetitive',label:'걷기·달리기·계단·쪼그려 앉기를 할 때',icon:'▥'},
 {id:'run_jump_kneel',label:'뛰기·점프·무릎 꿇기 같은 활동을 반복할 때',icon:'🏃'},
 {id:'forceful_extend',label:'점프·킥처럼 무릎을 강하게 또는 반복해서 펼 때',icon:'⚡'},
 {id:'repeated_trauma',label:'같은 무릎에 반복적으로 충격이나 부상이 있었어요',icon:'♻'},
 {id:'gradual_overuse',label:'특별한 한 번의 사고 없이 운동하면서 서서히 아파졌어요',icon:'⏳'},
 {id:'unsure',label:'잘 모르겠어요 / 직접 설명할게요',icon:'？'},
];
const KNEE_LOCATION:Option[] = [
 {id:'front_patellar',label:'무릎 앞쪽 / 무릎뼈 주변',icon:'↑'},
 {id:'below_patellar',label:'무릎뼈 바로 아래',icon:'↓'},
 {id:'tibial_tuberosity',label:'무릎 아래쪽에 튀어나온 뼈',icon:'⇊'},
 {id:'inner_whole',label:'무릎 안쪽 전체',icon:'←'},
 {id:'inner_joint_line',label:'무릎 안쪽 경계 부분',icon:'⇠'},
 {id:'outer_whole',label:'무릎 바깥쪽 전체',icon:'→'},
 {id:'outer_joint_line',label:'무릎 바깥쪽 경계 부분',icon:'⇢'},
 {id:'back',label:'무릎 뒤쪽',icon:'↩'},
 {id:'deep_whole',label:'무릎 전체 / 안쪽 깊은 곳',icon:'◎'},
 {id:'unsure',label:'정확히 모르겠어요',icon:'？'},
];
const ANKLE_MOI:Option[] = [
 {id:'inversion',label:'발목을 안쪽으로 접질렀을 때',icon:'⇙'},
 {id:'eversion',label:'발목을 바깥쪽으로 꺾었을 때',icon:'⇘'},
 {id:'rotation_dorsi',label:'발목이 돌아가면서 발끝이 위로 꺾였을 때',icon:'↻'},
 {id:'overstretch',label:'발목/발끝이 위로 과하게 꺾였을 때',icon:'⇡'},
 {id:'sudden_stopgo',label:'뛰다가 급하게 멈추거나 출발할 때 뒤쪽이 갑자기 아팠어요',icon:'⛔'},
 {id:'gradual_achilles',label:'특별한 한 번의 사고 없이 뒤쪽/아킬레스건이 서서히 아팠어요',icon:'⏳'},
 {id:'high_impact',label:'충돌·넘어짐 등 큰 충격을 받았어요',icon:'💥'},
 {id:'repetitive_overuse',label:'반복 운동하면서 서서히 발목이 아파졌어요',icon:'♻'},
 {id:'unsure',label:'잘 모르겠어요 / 직접 설명할게요',icon:'？'},
];
const ANKLE_LOCATION:Option[] = [
 {id:'lateral_malleolus',label:'바깥쪽 복숭아뼈 주변',icon:'→'},
 {id:'medial_malleolus',label:'안쪽 복숭아뼈 주변',icon:'←'},
 {id:'front_ankle',label:'발목 앞쪽',icon:'↑'},
 {id:'anterolateral_upper',label:'발목 앞쪽보다 조금 위 / 앞바깥쪽',icon:'↗'},
 {id:'achilles_back',label:'발목 뒤쪽 / 아킬레스건',icon:'↩'},
 {id:'whole_ankle',label:'발목 전체',icon:'◎'},
 {id:'other',label:'다른 곳',icon:'＋'},
 {id:'unsure',label:'잘 모르겠어요',icon:'？'},
];

/* =====================================================================
 * 후보 손상 정보 (이름 · 권장 진료과 · 진료에서 확인할 것 · 응급도)
 * ===================================================================== */
const KNEE_INFO:Record<string,InjuryInfo> = {
 patellar_trauma:{name:'슬개골 주변 외상(골절 포함 확인 필요)',specialty:'정형외과 또는 응급실',confirm:'무릎 전체 부종 여부, 압통 위치, 필요시 X-ray',urgent:true},
 mcl:{name:'내측측부인대(MCL) 손상 의심',specialty:'정형외과',confirm:'무릎 안쪽 인대 압통과 외반 스트레스 검사'},
 lcl:{name:'외측측부인대(LCL) 손상 의심',specialty:'정형외과',confirm:'무릎 바깥쪽 인대 압통과 내반 스트레스 검사'},
 meniscus_medial:{name:'내측 반월상연골 손상 의심',specialty:'정형외과',confirm:'관절선 압통, 잠김 여부, McMurray 검사 등'},
 meniscus_lateral:{name:'외측 반월상연골 손상 의심',specialty:'정형외과',confirm:'관절선 압통, 잠김 여부, McMurray 검사 등'},
 acl:{name:'전방십자인대(ACL) 손상 의심',specialty:'정형외과',confirm:'부종 발생 속도, 불안정성, Lachman 검사 등',urgent:true},
 pcl:{name:'후방십자인대(PCL) 손상 의심',specialty:'정형외과',confirm:'후방 전위(Posterior drawer) 등 전문 검사',urgent:true},
 osteochondral:{name:'골연골 손상(Osteochondral injury) 의심',specialty:'정형외과',confirm:'즉각적 부종·불안정성과 영상 검사',urgent:true},
 osgood_schlatter:{name:'오스굿-슐라터/라르센-요한슨 의심',specialty:'정형외과·소아청소년과',confirm:'경골조면(또는 슬개골 하단) 압통과 성장판 상태 확인'},
 patellar_tendinitis:{name:'슬개건병증(슬개건 과사용 손상) 의심',specialty:'정형외과·재활의학과',confirm:'슬개건 압통과 저항성 무릎 폄 검사'},
 chondromalacia:{name:'슬개대퇴 통증(연골연화증 등) 의심',specialty:'정형외과·재활의학과',confirm:'슬개골 압박 검사와 하지 정렬 상태 확인'},
 patellar_rupture:{name:'슬개건 파열 의심',specialty:'정형외과',confirm:'스스로 무릎 신전 가능 여부, 슬개골 위치 이상',urgent:true},
 loose_body:{name:'관절 유리체(Loose body) 의심',specialty:'정형외과',confirm:'걸림·popping의 재현 여부와 영상 검사'},
 overuse_general:{name:'반복적 과사용에 의한 무릎 통증(러너스니/장경인대 마찰 등 가능)',specialty:'정형외과·재활의학과',confirm:'현재 자료만으로는 세부 진단을 확정하기 어려워 임상 평가가 필요합니다'},
 soft_tissue_general:{name:'무릎 주변 연부조직 손상 또는 타박상',specialty:'정형외과·재활의학과',confirm:'통증 위치와 기능 변화를 기록하고 호전되지 않으면 진료를 받습니다'},
};
const ANKLE_INFO:Record<string,InjuryInfo> = {
 lateral_sprain:{name:'외측 발목 염좌 의심',specialty:'정형외과·재활의학과',confirm:'외측 인대(전거비인대 등) 압통과 안정성 검사'},
 eversion_injury:{name:'내측 발목 염좌(Eversion injury) 의심',specialty:'정형외과',confirm:'내측 삼각인대 압통과 안정성 검사'},
 high_ankle_sprain:{name:'하이 앵클(경비인대결합) 염좌 의심',specialty:'정형외과',confirm:'배굴·외회전 스트레스 검사, 경비인대결합 압통',urgent:true},
 achilles_strain:{name:'아킬레스건 급성 긴장(strain) 의심',specialty:'정형외과·재활의학과',confirm:'아킬레스건 압통과 저항성 발바닥 굽힘 검사'},
 achilles_tendinitis:{name:'아킬레스건염 의심',specialty:'정형외과·재활의학과',confirm:'만성 부하력과 건 비대·압통 확인'},
 achilles_rupture:{name:'아킬레스건 파열 의심',specialty:'정형외과',confirm:'Thompson 검사, 발뒤꿈치 들기 가능 여부',urgent:true},
 fracture_dislocation:{name:'골절·탈구 가능성 배제 필요',specialty:'정형외과 또는 응급실',confirm:'영상 검사(X-ray)로 골절·탈구 여부 확인',urgent:true},
 overuse_general_ankle:{name:'반복적 과사용에 의한 발목 통증(가능성: 과사용성 건/인대 자극)',specialty:'정형외과·재활의학과',confirm:'현재 자료만으로는 세부 진단을 확정하기 어려워 임상 평가가 필요합니다'},
 soft_tissue_general_ankle:{name:'발목 주변 연부조직 손상',specialty:'정형외과·재활의학과',confirm:'통증 위치와 기능 변화를 기록하고 호전되지 않으면 진료를 받습니다'},
};

/* =====================================================================
 * 헬퍼: 질문/결과 노드 생성
 * ===================================================================== */
interface BranchSpec {
 multi?:Option[]; hint?:string; yesLabel?:string; noLabel?:string; unknownLabel?:string;
 [key:string]: BranchTarget | Option[] | string | undefined;
}
function Q(id:string, prompt:string, spec:BranchSpec):QuestionNode {
 const { multi, hint, yesLabel, noLabel, unknownLabel, ...rest } = spec;
 const branch:Record<string,BranchTarget> = {};
 for(const k of Object.keys(rest)) branch[k]=rest[k] as BranchTarget;
 return { kind:'question', id, prompt, branch, hint, multi, yesLabel, noLabel, unknownLabel };
}
function O(results:ResultRef[], fallbackNote?:string):OutcomeNode { return { kind:'outcome', results, fallbackNote }; }
function R(patternId:string, tier:Tier, note:string):ResultRef { return { patternId, tier, note }; }
const NO_PATTERN = (msg='현재 자료(PDF)만으로는 특정 손상으로 좁히기 어렵습니다. 아래 위험 신호 확인과 경과 관찰을 참고하고, 통증이 지속되면 진료를 받으세요.'):OutcomeNode => O([], msg);

function resolve(target:BranchTarget):EngineNode {
 return typeof target === 'string' ? (KNEE_NODES[target] ?? ANKLE_NODES[target]) : target;
}

/* =====================================================================
 * 무릎(KNEE) 질문 엔진 — 사용자가 제공한 K1~K15 구조를 그대로 구현
 * ===================================================================== */
const KNEE_NODES:Record<string,QuestionNode> = {};
function kn(node:QuestionNode):string { KNEE_NODES[node.id]=node; return node.id; }

/* ---- K1. 충격 × 앞쪽/무릎뼈 ---- */
kn(Q('K1Q4','충격이 무릎 앞쪽이나 무릎뼈에 직접 가해졌나요?',{
 yes:'K1Q5',
 no:'K1Q5B',
 unknown:'K1Q5',
}));
kn(Q('K1Q5','다친 뒤 무릎 전체가 눈에 띄게 부었나요?',{
 yes:O([R('patellar_trauma','strong','충격이 무릎뼈에 직접 가해졌고, 이후 무릎 전체가 눈에 띄게 부어 슬개골 관련 외상/골절을 의료진이 확인할 필요가 있는 패턴입니다.')]),
 no:'K1Q6',
 unknown:'K1Q6',
}));
kn(Q('K1Q6','다친 직후 통증 때문에 평소처럼 움직이기 어려웠나요?',{
 yes:O([R('patellar_trauma','partial','슬개골 앞쪽 외상은 기록하지만, 자료만으로 다른 급성 손상과 완전히 구별하기는 어렵습니다.')]),
 no:O([R('soft_tissue_general','partial','슬개골 앞쪽에 직접 충격을 받았지만 부종·기능 저하가 뚜렷하지 않아, 현재 PDF만으로 특정 손상으로 좁히지 않습니다.')]),
 unknown:NO_PATTERN('정보가 부족합니다. 의료진 확인이 필요합니다.'),
}));
kn(Q('K1Q5B','충격과 함께 무릎이 비틀리거나 뒤로 과하게 펴졌나요?',{
 multi:[
  {id:'twist',label:'비틀렸어요',icon:'↻'},
  {id:'hyperext',label:'뒤로 과하게 펴졌어요',icon:'⇤'},
  {id:'neither',label:'둘 다 아니에요',icon:'✕'},
 ],
 twist:'K4M_OR_L', // 위치를 모르므로 안쪽/바깥쪽 관절선 여부를 한 번 더 확인
 hyperext:'K6Q4',
 neither:NO_PATTERN('충격은 있었지만 앞쪽 직접 충격도, 비틀림·과신전도 아니어서 현재 PDF로 특정 anterior injury를 좁히기 어렵습니다.'),
}));
kn(Q('K4M_OR_L','통증이 무릎 안쪽 경계와 바깥쪽 경계 중 어느 쪽에 더 가까운가요?',{
 multi:[
  {id:'inner',label:'안쪽 경계',icon:'←'},
  {id:'outer',label:'바깥쪽 경계',icon:'→'},
  {id:'unsure',label:'잘 모르겠어요',icon:'？'},
 ],
 inner:'K4MQ4', outer:'K4LQ4', unsure:'K4MQ4',
}));

/* ---- K2. 충격 × 안쪽 (MCL), NO 시 K4(Meniscus)로 이동 ---- */
kn(Q('K2Q4','충격과 함께 무릎 안쪽이 뻣뻣하거나 붓는 느낌이 있나요?',{
 yes:'K2Q5', no:'K2Q5B', unknown:'K2Q5',
}));
kn(Q('K2Q5','무릎을 굽히고 펴는 범위가 평소보다 줄었나요?',{ yes:'K2Q6', no:'K2Q6', unknown:'K2Q6' }));
kn(Q('K2Q6','무릎이 흔들리거나 빠질 것 같은 느낌이 있나요?',{
 yes:O([R('mcl','strong','충격 후 안쪽 뻣뻣함/부종, 가동범위 감소, 불안정감까지 MCL의 여러 특징이 함께 확인됩니다.')]),
 no:O([R('mcl','partial','MCL의 일부 특징만 확인되어, 반월상연골 손상 가능성도 함께 비교가 필요합니다.'),R('meniscus_medial','partial','불안정감이 없어 MCL 확신도가 낮아지므로 내측 반월상연골 손상도 함께 고려합니다.')]),
 unknown:O([R('mcl','partial','MCL 관련 일부 특징이 확인되나, 불안정감 여부가 불확실해 의료진 확인이 필요합니다.')]),
}));
kn(Q('K2Q5B','통증이 무릎 안쪽 전체보다 ‘안쪽 경계의 한 줄’에 더 가깝나요?',{
 yes:'K4MQ4',
 no:'K2Q6',
 unknown:'K2Q6',
}));

/* ---- K3. 충격 × 바깥쪽 (LCL) ---- */
kn(Q('K3Q4','바깥쪽이 붓거나 무릎이 불안정한 느낌이 있나요?',{
 multi:[
  {id:'swell',label:'붓기 있음',icon:'●'},
  {id:'unstable',label:'불안정감 있음',icon:'↯'},
  {id:'both',label:'둘 다 있음',icon:'✚'},
  {id:'none',label:'둘 다 없음',icon:'✕'},
  {id:'unknown',label:'모르겠음',icon:'？'},
 ],
 swell:O([R('lcl','strong','충격 후 무릎 바깥쪽 붓기가 확인되어 LCL 관련 패턴을 남깁니다.')]),
 unstable:O([R('lcl','strong','충격 후 무릎 바깥쪽 불안정감이 확인되어 LCL 관련 패턴을 남깁니다.')]),
 both:O([R('lcl','strong','충격 후 무릎 바깥쪽 붓기와 불안정감이 함께 확인되어 LCL 관련 패턴을 남깁니다.')]),
 none:'K3Q5',
 unknown:'K3Q5',
}));
kn(Q('K3Q5','충격과 함께 무릎이 비틀렸나요?',{
 yes:O([R('meniscus_lateral','partial','비틀림이 동반되어 외측 반월상연골 손상/골연골 손상 질문도 함께 열어 확인이 필요합니다.'),R('osteochondral','partial','비틀림이 동반되어 골연골 손상 가능성도 비교가 필요합니다.')]),
 no:O([R('soft_tissue_general','partial','LCL 특징이 부족해 일반 외상으로 기록하되, 지속되면 진료가 필요합니다.')]),
 unknown:O([R('soft_tissue_general','partial','걸림(locking)이나 딱소리 등 다른 소견을 함께 확인해야 합니다.')]),
}));

/* ---- K4. 비틀림 × 안쪽/바깥쪽 관절 경계 (Meniscus 대표 경로) ----
 * 내측/외측은 진입 시점(location)에 따라 갈리므로, 같은 질문 구조를 접두어만 바꿔
 * 두 벌(K4M=내측, K4L=외측) 만들어 결과 패턴이 런타임에 뒤섞이지 않게 한다. */
function buildMeniscusChain(prefix:string, patternId:string, sideLabel:string){
 kn(Q(prefix+'Q4','무릎이 걸리거나 잠겨서 움직이기 어려운 적이 있나요?',{
  yes:prefix+'Q5A', no:prefix+'Q5B', unknown:prefix+'Q5C',
 }));
 kn(Q(prefix+'Q5A','다친 직후보다 시간이 지나면서 무릎이 부었나요?',{ yes:prefix+'Q6', no:prefix+'Q6', unknown:prefix+'Q6' }));
 kn(Q(prefix+'Q5B','무릎이 갑자기 힘없이 꺾이거나 빠질 것 같은 느낌이 있나요?',{ yes:prefix+'Q6', no:prefix+'Q6', unknown:prefix+'Q6' }));
 kn(Q(prefix+'Q5C','다친 뒤 1~3일 사이에 붓기가 생겼나요?',{ yes:prefix+'Q6', no:prefix+'Q6', unknown:prefix+'Q6' }));
 kn(Q(prefix+'Q6','무릎 움직임이 평소보다 줄었나요?',{
  yes:O([R(patternId,'strong',`회전/비틀림 후 ${sideLabel} 관절선 통증, 시간차 부종, 잠김/불안정감, 가동범위 감소까지 반월상연골 손상의 특징들이 함께 확인됩니다.`)]),
  no:'K5Q7',
  unknown:'K5Q7',
 }));
}
buildMeniscusChain('K4M','meniscus_medial','안쪽');
buildMeniscusChain('K4L','meniscus_lateral','바깥쪽');

/* ---- K5. Meniscus 핵심 소견이 계속 NO일 때: 다시 검증 ---- */
kn(Q('K5Q7','다칠 때 ‘뚝/딱’ 하는 느낌이나 소리가 있었나요?',{
 yes:'K5Q8', no:'K5Q8B', unknown:'K5Q8',
}));
kn(Q('K5Q8','다친 직후 무릎이 바로 부었나요?',{
 yes:O([R('osteochondral','partial','회전 손상 후 즉각적 pop과 급속 부종이 있어 골연골 손상/ACL 손상을 비교 확인해야 합니다.'),R('acl','partial','같은 이유로 ACL 손상 가능성도 함께 열어 둡니다.')]),
 no:NO_PATTERN('반월상연골 소견이 대부분 부정적이고, pop 후 급속 부종도 없어 현재 PDF에서 뚜렷한 패턴을 찾기 어렵습니다.'),
 unknown:O([R('soft_tissue_general','partial','기능(체중부하·지속 운동 가능 여부)을 추가로 확인해야 합니다.')]),
}));
kn(Q('K5Q8B','통증이 안쪽 전체로 퍼져 있고 뻣뻣한 느낌도 있나요?',{
 yes:'K2Q6',
 no:NO_PATTERN('반월상연골 특징이 대부분 부정적이며 다른 뚜렷한 패턴도 확인되지 않아, 특정 source로 좁히기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다. 의료진 확인이 필요합니다.'),
}));

/* ---- K6. 급정지·방향전환/과신전 × 전체·깊은 곳 (ACL) ---- */
kn(Q('K6Q4','그 순간 무릎에서 ‘뚝/퍽’ 하는 느낌이나 소리가 있었나요?',{
 yes:'K6Q5A', no:'K6Q5B', unknown:'K6Q5C',
}));
kn(Q('K6Q5A','다친 직후 무릎이 빠르게 부었나요?',{ yes:'K6Q6', no:'K6Q6', unknown:'K6Q6' }));
kn(Q('K6Q5B','다친 직후 심한 통증 때문에 운동을 계속하기 어려웠나요?',{ yes:'K6Q6', no:'K6Q6', unknown:'K6Q6' }));
kn(Q('K6Q5C','다친 직후 빠르게 부었나요?',{ yes:'K6Q6', no:'K6Q6', unknown:'K6Q6' }));
kn(Q('K6Q6','다친 직후 운동을 계속하기 어려울 만큼 통증이 심했나요? (앞선 답변과 함께 pop·급속 부종·기능 저하를 종합할게요)',{
 yes:O([R('acl','strong','pop/딱 소리, 빠른 부종, 심한 기능 저하가 함께 확인되어 ACL 관련 핵심 징후 3가지가 모두 모였습니다.')]),
 no:'K7Q_LOCKING',
 unknown:'K7Q_LOCKING',
}));

/* ---- K7. ACL 소견이 잘 맞지 않을 때 ---- */
kn(Q('K7Q_LOCKING','무릎이 걸리거나 잠기는 느낌이 있나요?',{
 yes:'K7Q_MENISCUS_SWELL',
 no:'K7Q_SNAP',
 unknown:'K7Q_SNAP',
}));
kn(Q('K7Q_MENISCUS_SWELL','다친 직후보다 시간이 지나면서 무릎이 부었나요?',{
 yes:O([R('meniscus_medial','partial','급정지 후 걸림과 시간차 부종이 확인되어 반월상연골 손상(내측 또는 외측)을 검증해야 합니다. 안쪽/바깥쪽 구분은 진료에서 관절선 압통으로 확인이 필요합니다.'),R('meniscus_lateral','partial','같은 이유로 외측 반월상연골 손상 가능성도 함께 남겨 둡니다.')]),
 no:O([R('meniscus_medial','partial','걸림은 있으나 시간차 부종은 없어 확신도는 낮지만, 반월상연골 손상 가능성을 배제하기 위한 확인이 필요합니다.')]),
 unknown:O([R('meniscus_medial','partial','정보가 불충분하여 의료진 확인이 필요합니다.')]),
}));
kn(Q('K7Q_SNAP','무릎이 ‘snap’하면서 빠질 것 같은 느낌이 있었나요?',{
 yes:O([R('osteochondral','partial','급정지 후 걸림은 없지만 snap과 함께 빠질 것 같은 느낌이 있어 골연골 손상 가능성을 확인해야 합니다.')]),
 no:NO_PATTERN('ACL 핵심 징후가 대부분 없고 걸림·snap도 없어 현재 PDF에서 특정 패턴이 부족합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다. 의료진 확인이 필요합니다.'),
}));

/* ---- K8. 굽힌 무릎으로 넘어짐 × 뒤쪽 (PCL) ---- */
kn(Q('K8Q4','다칠 때 무릎 뒤쪽에서 pop을 느꼈나요?',{ yes:'K8Q5A', no:'K8Q5B', unknown:'K8Q5B' }));
kn(Q('K8Q5A','뒤쪽 통증에 비해 붓기는 비교적 적은 편인가요?',{
 yes:O([R('pcl','strong','굽힌 무릎으로 넘어진 뒤 후방 pop, 비교적 적은 부종까지 PCL의 여러 특징이 일치합니다.')]),
 no:O([R('pcl','partial','PCL 일부 특징은 있으나 부종 양상이 다르므로 다른 급성 손상도 함께 검증이 필요합니다.')]),
 unknown:O([R('pcl','partial','PCL 일부 특징이 확인됩니다. 추가 확인이 필요합니다.')]),
}));
kn(Q('K8Q5B','통증이 주로 무릎 뒤쪽에 계속 느껴지나요?',{
 yes:O([R('pcl','partial','후방 통증이 지속되어 PCL 일부 패턴에 해당하나, pop이 없어 확신도는 낮습니다.')]),
 no:NO_PATTERN('무릎 뒤쪽 통증이 지속되지 않아 다른 위치/손상 패턴을 재검토해야 합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- K9. 반복 달리기·점프·무릎꿇기 × 튀어나온 뼈(경골조면) → Osgood ---- */
kn(Q('K9Q4','뛰거나 점프할 때 그 부위 통증이 더 뚜렷해지나요?',{ yes:'K9Q5A', no:'K9Q5B', unknown:'K9Q5A' }));
kn(Q('K9Q5A','무릎을 꿇을 때도 같은 부위가 아픈가요?',{ yes:'K9Q6A', no:'K9Q6B', unknown:'K9Q6A' }));
kn(Q('K9Q6A','그 부위가 붓거나 통증이 한 지점에 뚜렷하게 모여 있나요?',{
 yes:O([R('osgood_schlatter','strong','뛰기/점프/무릎꿇기에서 통증이 뚜렷해지고, 부종과 한 지점에 집중된 압통까지 확인되어 오스굿-슐라터(또는 라르센-요한슨)의 특징들이 일치합니다.')]),
 no:O([R('osgood_schlatter','partial','일부 특징만 일치해 다른 전방 무릎 손상도 함께 검증이 필요합니다.'),R('chondromalacia','partial','전방 무릎 통증의 다른 원인도 비교합니다.')]),
 unknown:O([R('osgood_schlatter','partial','오스굿 관련 일부 특징이 확인됩니다. 의료진 확인이 필요합니다.')]),
}));
kn(Q('K9Q6B','계단을 오르내리거나 쪼그려 앉을 때는 무릎 앞쪽이 아픈가요?',{
 yes:'K11Q4',
 no:'K9Q_TENDON',
 unknown:'K9Q_TENDON',
}));
kn(Q('K9Q5B','계단을 오르내리거나 쪼그려 앉을 때는 무릎 앞쪽이 아픈가요?',{
 yes:'K11Q4',
 no:'K9Q_TENDON',
 unknown:'K9Q_TENDON',
}));
kn(Q('K9Q_TENDON','점프하거나 무릎을 힘주어 펼 때 무릎뼈 바로 아래가 아픈가요?',{
 yes:O([R('patellar_tendinitis','partial','뛰기/점프 활동과 관련은 있으나 위치가 슬개건 쪽에 더 가까워 슬개건병증 경로를 확인해야 합니다.')]),
 no:NO_PATTERN('뛰기·점프·무릎꿇기 관련 통증이지만 오스굿·연골연화증·슬개건병증 어디에도 뚜렷이 맞지 않아 현재 PDF에서 특정 패턴으로 좁히기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다. 의료진 확인이 필요합니다.'),
}));

/* ---- K10. 반복 활동(점프/폄) × 무릎뼈 바로 아래 → 슬개건병증/라르센-요한슨 ---- */
kn(Q('K10Q4','점프하거나 무릎을 반복해서 펼 때 그곳이 아픈가요?',{ yes:'K10Q5A', no:'K10Q5B', unknown:'K10Q5A' }));
kn(Q('K10Q5A','통증이 무릎뼈 바로 아래에 집중되나요?',{
 yes:O([R('patellar_tendinitis','strong','반복적인 점프·폄 동작과 함께 통증이 슬개골 바로 아래에 집중되어 슬개건병증(또는 라르센-요한슨)과 관련된 패턴이 확인됩니다.')]),
 no:NO_PATTERN('점프/폄과 관련은 있으나 통증 위치가 다르게 느껴져, 전방 무릎 통증 경로를 다시 확인해야 합니다.'),
 unknown:O([R('patellar_tendinitis','partial','일부 특징이 확인되나 위치가 불확실합니다.')]),
}));
kn(Q('K10Q5B','걷기·계단·쪼그려 앉을 때 무릎 앞쪽 통증이 있나요?',{
 yes:'K11Q4',
 no:NO_PATTERN('오스굿-슐라터/라르센-요한슨/슬개건병증 관련 특징이 부족해 현재 PDF로 특정 패턴을 확정하기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- K11. 걷기·계단·쪼그리기 × 앞쪽 → 연골연화증(Chondromalacia) ---- */
kn(Q('K11Q4','계단이나 쪼그려 앉을 때 특히 아픈가요?',{ yes:'K11Q5A', no:'K11Q5B', unknown:'K11Q5A' }));
kn(Q('K11Q5A','무릎을 굽히고 펼 때 갈리거나 사각거리는 느낌이 있나요?',{ yes:'K11Q6A', no:'K11Q6A', unknown:'K11Q6A' }));
kn(Q('K11Q5B','걷거나 달릴 때도 앞쪽이 아픈가요?',{
 yes:'K11Q6B',
 no:'K12Q7',
 unknown:'K11Q6B',
}));
/* K11Q6은 "이 동작"이 무엇인지 밝히지 않은 채 붓기 여부만 물어 혼란을 줄 수 있었다.
 * 어느 경로로 들어왔는지에 따라 직전에 확인된 동작(계단·쪼그려 앉기 / 걷기·달리기)을
 * 질문 문장에 직접 넣어, 다시 앞으로 돌아가지 않아도 무슨 동작을 말하는지 알 수 있게 한다. */
kn(Q('K11Q6A','계단을 오르내리거나 쪼그려 앉는 동작을 할 때마다 붓기가 반복해서 생기나요?',{
 yes:O([R('chondromalacia','strong','계단·쪼그려 앉기에서의 통증, 갈리는 느낌, 반복적인 붓기까지 연골연화증 관련 특징이 여러 개 확인됩니다.')]),
 no:O([R('chondromalacia','partial','일부 특징만 일치해 확신도가 낮습니다.')]),
 unknown:'K12Q7',
}));
kn(Q('K11Q6B','걷거나 달리는 동작을 할 때마다 붓기가 반복해서 생기나요?',{
 yes:O([R('chondromalacia','strong','걷기·달리기에서의 앞쪽 통증과 반복적인 붓기까지 연골연화증 관련 특징이 여러 개 확인됩니다.')]),
 no:O([R('chondromalacia','partial','일부 특징만 일치해 확신도가 낮습니다.')]),
 unknown:'K12Q7',
}));

/* ---- K12. Chondromalacia 소견이 전부 NO일 때 ---- */
kn(Q('K12Q7','점프하거나 무릎을 반복해서 펼 때 무릎뼈 아래가 아픈가요?',{
 yes:O([R('patellar_tendinitis','partial','앞쪽 통증이지만 연골연화증보다는 슬개건병증 검증이 더 적합합니다.')]),
 no:'K12Q8',
 unknown:'K12Q8',
}));
kn(Q('K12Q8','무릎 아래 튀어나온 부분이 뛰거나 무릎 꿇을 때 아픈가요?',{
 yes:O([R('osgood_schlatter','partial','앞쪽 통증이지만 오스굿-슐라터 검증이 더 적합합니다.')]),
 no:NO_PATTERN('앞쪽 통증이라는 이유만으로 연골연화증에 매달리지 않고 확인한 결과, 현재 PDF에서 특정 pattern이 부족합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- K13. 강한 무릎 펴기/점프/킥 × 무릎뼈 아래 (슬개건 파열 vs 슬개건병증) ---- */
kn(Q('K13Q4','한 번의 강한 동작에서 갑자기 아파졌나요, 반복하면서 아파졌나요?',{
 multi:[
  {id:'sudden',label:'한 번에 갑자기',icon:'⚡'},
  {id:'repetitive',label:'반복하면서',icon:'♻'},
  {id:'unsure',label:'모르겠어요',icon:'？'},
 ],
 sudden:'K13Q5',
 repetitive:'K13Q_REP',
 unsure:'K13Q5',
}));
kn(Q('K13Q5','지금 스스로 무릎을 끝까지 펴기 매우 어렵거나 불가능한가요?',{
 yes:'K13Q6',
 no:O([R('patellar_tendinitis','partial','갑자기 아파졌지만 스스로 폄이 가능해 파열보다는 슬개건병증/다른 전방 손상 가능성이 더 높습니다.')]),
 unknown:'K13Q6',
}));
kn(Q('K13Q6','처음에 통증과 붓기가 상당히 컸나요?',{
 yes:O([R('patellar_rupture','strong','강한 폄 동작 중 갑자기 발생, 스스로 폄이 어렵고 초기 통증·부종이 컸던 점까지 슬개건 파열의 특징과 일치해 의료진 확인이 반드시 필요합니다.')]),
 no:O([R('patellar_tendinitis','partial','파열을 강하게 지지하는 소견은 부족해 슬개건병증 등 다른 패턴과 비교가 필요합니다.')]),
 unknown:O([R('patellar_rupture','partial','폄이 어려운 상태이므로 파열 가능성을 배제하기 위해 의료진 확인이 필요합니다.')]),
}));
kn(Q('K13Q_REP','통증이 무릎뼈 바로 아래 한 지점에 집중되나요?',{
 yes:O([R('patellar_tendinitis','strong','반복적인 폄 동작과 함께 통증이 슬개골 바로 아래 한 지점에 집중되어 슬개건병증 패턴이 확인됩니다.')]),
 no:'K11Q4',
 unknown:O([R('patellar_tendinitis','partial','일부 특징이 확인되나 위치가 불확실합니다.')]),
}));

/* ---- K14. 반복적 충격/과거 부상 → Loose body ---- */
kn(Q('K14Q4','무릎이 걸리거나 안에서 무언가 걸리는 느낌이 있나요?',{ yes:'K14Q5A', no:'K14Q5B', unknown:'K14Q5B' }));
kn(Q('K14Q5A','딱딱거리거나 popping하면서 불안정한 느낌도 있나요?',{
 yes:O([R('loose_body','strong','반복적인 충격/과거 부상 병력과 함께 걸림, popping, 불안정감까지 관절 유리체(Loose body)의 특징이 확인됩니다.')]),
 no:O([R('loose_body','partial','걸림은 있으나 popping·불안정감이 없어 확신도는 낮으며, 반월상연골 손상도 함께 검증이 필요합니다.'),R('meniscus_medial','partial','걸림 증상이 반월상연골 손상과도 겹칠 수 있어 함께 확인합니다.')]),
 unknown:O([R('loose_body','partial','추가 확인이 필요합니다.')]),
}));
kn(Q('K14Q5B','popping 또는 무릎이 불안정한 느낌은 있나요?',{
 yes:O([R('loose_body','partial','걸림은 없지만 popping/불안정감이 있어 관절 유리체 일부 특징에 해당합니다.')]),
 no:NO_PATTERN('반복 외상 병력만으로는 특정 pattern이 부족합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- K15. 반복 운동 + 안쪽/바깥쪽 통증 → 과사용성 손상(자료에 세부 근거 부족, 짧게 종료) ---- */
kn(Q('K15Q4','한 번의 사고보다 반복해서 운동하면서 점점 생긴 통증인가요?',{
 yes:O([R('overuse_general','partial','반복적인 과사용과 관련된 무릎 통증 패턴까지만 확인되며, 현재 자료에는 이 유형의 세부 진단 기준이 없어 더 좁히지 않습니다.')]),
 no:'K1Q4',
 unknown:O([R('soft_tissue_general','partial','일반 기록으로 남깁니다.')]),
}));

/* ---- 일반형(자료에 해당 조합이 명시되지 않은 경우) ---- */
kn(Q('KG_SWELL','다친 뒤 무릎이 붓거나 멍이 들었나요?',{ yes:'KG_LOCK', no:'KG_LOCK', unknown:'KG_LOCK' }));
kn(Q('KG_LOCK','무릎이 걸리거나 잠기는 느낌, 또는 흔들리는 불안정감이 있나요?',{
 yes:O([R('soft_tissue_general','partial','걸림 또는 불안정감이 있어 반월상연골·인대 손상을 배제하기 위한 정밀 진료가 권장됩니다.')]),
 no:O([R('soft_tissue_general','partial','현재 선택하신 기전·위치 조합은 자료에 세부 기준이 없어, 일반적인 연부조직 손상으로 기록합니다.')]),
 unknown:NO_PATTERN(),
}));

/* =====================================================================
 * 발목(ANKLE) 질문 엔진 — A1~A10
 * ===================================================================== */
const ANKLE_NODES:Record<string,QuestionNode> = {};
function an(node:QuestionNode):string { ANKLE_NODES[node.id]=node; return node.id; }

/* ---- A1. 안쪽으로 접질림 × 바깥쪽 (Inversion sprain) ---- */
an(Q('A1Q4','접질릴 때 pop/snap 같은 느낌이 있었나요?',{ yes:'A1Q5A', no:'A1Q5B', unknown:'A1Q5B' }));
an(Q('A1Q5A','바깥쪽이 붓거나 멍/색 변화가 생겼나요?',{ yes:'A1Q6', no:'A1Q6', unknown:'A1Q6' }));
an(Q('A1Q5B','다친 발에 체중을 싣기가 어렵나요?',{ yes:'A1Q6', no:'A1Q6', unknown:'A1Q6' }));
an(Q('A1Q6','발목이 흔들리거나 다시 접질릴 것 같은 느낌이 있나요?',{
 yes:O([R('lateral_sprain','strong','안쪽으로 접질린 후 바깥쪽 붓기/멍, 체중부하 어려움, 불안정감까지 외측 발목 염좌의 특징이 여러 개 확인됩니다. (등급은 이 결과만으로 확정하지 않습니다)')]),
 no:'A2Q_CHECK',
 unknown:'A2Q_CHECK',
}));

/* ---- A2. Inversion 소견이 계속 약할 때: 위치 재확인 ---- */
an(Q('A2Q_CHECK','통증이 실제로 바깥쪽 복숭아뼈 주변보다 발목 앞쪽·위쪽에 더 가까운가요?',{
 yes:'A2Q_ROTATE',
 no:'A2Q_ACHILLES',
 unknown:O([R('lateral_sprain','partial','외측 염좌의 핵심 특징은 부족하지만, 위치도 불확실해 경미한 염좌로 기록하며 경과를 지켜봐야 합니다.')]),
}));
an(Q('A2Q_ROTATE','접질릴 때 회전하면서 발끝이 위로 꺾이기도 했나요?',{
 yes:'A5Q4',
 no:NO_PATTERN('현재 자료에서 다른 특정 pattern을 확정하기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));
an(Q('A2Q_ACHILLES','통증이 발목 뒤쪽·아킬레스건 쪽에 더 가깝나요?',{
 yes:'A3Q4',
 no:O([R('lateral_sprain','partial','경미한 외측 염좌로 기록하되, 증상이 계속되면 진료를 받으세요.')]),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- A3. 안쪽 접질림 × 아킬레스 (급성 Achilles strain) ---- */
an(Q('A3Q4','뒤쪽 통증과 함께 힘이 빠지는 느낌이 있나요?',{
 yes:O([R('achilles_strain','strong','접질림과 함께 발생한 후방 통증과 힘 빠짐이 확인되어 급성 아킬레스건 긴장(strain)과 관련된 패턴입니다. (염좌와 동반될 수 있습니다)')]),
 no:'A3Q5',
 unknown:'A3Q5',
}));
an(Q('A3Q5','다칠 때 뒤쪽에서 갑자기 snap을 느꼈나요?',{
 yes:'A7Q5A',
 no:O([R('achilles_strain','partial','아킬레스건 긴장의 일부 특징만 확인되어 정보가 부족합니다.')]),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- A4. 바깥쪽으로 꺾임 × 안쪽 (Eversion) ---- */
an(Q('A4Q4','현재 발에 체중을 싣는 데 문제가 있나요?',{ yes:'A4Q5', no:'A4Q5', unknown:'A4Q5' }));
an(Q('A4Q5','심한 붓기와 통증이 같이 있나요?',{
 yes:O([R('fracture_dislocation','partial','붓기·통증이 심해 골절·탈구 가능성도 함께 확인이 필요합니다.'),R('eversion_injury','partial','바깥쪽으로 꺾인 뒤 안쪽 통증이 있어 eversion 관련 손상으로도 기록합니다.')]),
 no:O([R('eversion_injury','partial','eversion 기전과 관련된 손상으로 기록합니다. (자료에 세부 Signs & Symptoms 기준이 많지 않아 확정하지 않습니다)')]),
 unknown:O([R('eversion_injury','partial','정보가 불충분해 의료진 확인이 필요합니다.')]),
}));

/* ---- A5. 회전+발끝 위로 꺾임 × 앞바깥/위쪽 (High ankle sprain) ---- */
an(Q('A5Q4','걷거나 운동하는 기능이 많이 제한되나요?',{ yes:'A5Q5A', no:'A5Q5B', unknown:'A5Q5A' }));
an(Q('A5Q5A','발끝을 위로 당겨 발목을 굽힐 때 통증이 더 심해지나요?',{
 yes:O([R('high_ankle_sprain','strong','회전과 함께 발끝이 젖혀진 뒤 기능 제한과 배굴 시 통증 악화까지 하이 앵클 염좌의 특징이 여러 개 확인됩니다.')]),
 no:'A6Q_LOC',
 unknown:'A6Q_LOC',
}));
an(Q('A5Q5B','발목을 위로 움직일 때 통증이 생기나요?',{
 yes:O([R('high_ankle_sprain','partial','하이 앵클 염좌의 일부 특징만 확인되어 확신도가 낮습니다.')]),
 no:'A6Q_LOC',
 unknown:'A6Q_LOC',
}));
an(Q('A6Q_LOC','통증이 발목 앞위쪽보다 아킬레스건 뒤쪽에 확실히 집중되나요?',{
 yes:'A6Q5',
 no:NO_PATTERN('하이 앵클 염좌 특징이 부족하고 다른 위치로도 확인되지 않아 현재 PDF로 특정 손상을 좁히기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));
an(Q('A6Q5','힘이 빠지는 느낌이 있나요?',{
 yes:O([R('achilles_strain','strong','통증이 아킬레스건 뒤쪽에 집중되고 힘이 빠지는 느낌까지 있어 급성 아킬레스건 긴장 가능성이 높습니다.')]),
 no:'A6Q6',
 unknown:'A6Q6',
}));
an(Q('A6Q6','갑자기 snap이 있었나요?',{
 yes:'A7Q5A',
 no:O([R('achilles_strain','partial','아킬레스건 관련 일부 특징만 확인되어 자료가 부족합니다.')]),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- A7. 갑작스러운 stop-and-go × 아킬레스 (Rupture) ---- */
an(Q('A7Q4','뒤쪽에서 갑자기 ‘뚝’ 하는 느낌이 있었나요?',{ yes:'A7Q5A', no:'A7Q5B', unknown:'A7Q5C' }));
an(Q('A7Q5A','그 순간 갑자기 강한 통증이 생겼나요?',{ yes:'A7Q6', no:'A7Q_STRAIN', unknown:'A7Q6' }));
an(Q('A7Q6','이후 붓기·멍 또는 발목 움직임 감소가 생겼나요?',{
 yes:O([R('achilles_rupture','strong','급격한 stop-and-go 중 뒤쪽 snap, 강한 통증, 이후 부종·멍·가동범위 감소까지 아킬레스건 파열의 특징이 함께 확인되어 의료진 확인이 반드시 필요합니다.')]),
 no:O([R('achilles_rupture','partial','파열 일부 특징만 확인되어 아킬레스건 긴장(strain)과도 비교가 필요합니다.'),R('achilles_strain','partial','파열 확신도가 낮아 아킬레스건 긴장 가능성도 함께 확인합니다.')]),
 unknown:O([R('achilles_rupture','partial','정보가 불충분하여 의료진 확인이 필요합니다.')]),
}));
an(Q('A7Q5B','뒤쪽 통증과 힘 빠짐이 같이 있나요?',{
 yes:O([R('achilles_strain','strong','snap 없이 급성 후방 통증과 힘 빠짐이 함께 있어 급성 아킬레스건 긴장에 해당하는 패턴입니다.')]),
 no:NO_PATTERN('snap도, 통증·힘빠짐 조합도 뚜렷하지 않아 현재 자료로 파열/긴장 특징이 부족합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));
an(Q('A7Q5C','뒤쪽 통증과 힘 빠짐이 같이 있나요?',{
 yes:'A7Q6',
 no:NO_PATTERN('정보가 불충분해 현재 PDF로 특정 패턴을 확정하기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));
an(Q('A7Q_STRAIN','뒤쪽 통증과 힘 빠짐이 같이 있나요?',{
 yes:O([R('achilles_strain','strong','급격한 stop-and-go 중 뒤쪽 통증과 힘 빠짐이 함께 있어 급성 아킬레스건 긴장에 해당합니다.')]),
 no:NO_PATTERN('파열/긴장 특징이 부족합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- A8. Achilles 서서히 아픔 (Tendinitis) ---- */
an(Q('A8Q4','아침에 일어났을 때 뻣뻣하거나 불편한가요?',{ yes:'A8Q5A', no:'A8Q5B', unknown:'A8Q5B' }));
an(Q('A8Q5A','움직일 때 갈리거나 사각거리는 느낌이 있나요?',{
 yes:O([R('achilles_tendinitis','strong','서서히 시작된 후방 통증, 아침 뻣뻣함, 갈리는 느낌(crepitus)까지 아킬레스건염의 특징이 여러 개 확인됩니다.')]),
 no:O([R('achilles_tendinitis','partial','아침 뻣뻣함은 있으나 다른 특징이 부족해 확신도가 낮습니다.')]),
 unknown:O([R('achilles_tendinitis','partial','일부 특징만 확인됩니다.')]),
}));
an(Q('A8Q5B','아킬레스건 전체적으로 통증이 있나요?',{
 yes:O([R('achilles_tendinitis','partial','전반적인 통증이 있어 아킬레스건염 일부 특징에 해당합니다.')]),
 no:'A8Q_SUDDEN',
 unknown:'A8Q_SUDDEN',
}));
an(Q('A8Q_SUDDEN','갑작스러운 stop-and-go 순간 시작된 통증이었나요?',{
 yes:'A7Q4',
 no:NO_PATTERN('현재 아킬레스건염 자료와 일치가 약해 특정 패턴으로 확정하기 어렵습니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- A9. 큰 충격 × 발목 전체 (Fracture/dislocation 확인) ---- */
an(Q('A9Q4','발목이 매우 심하게 붓고 통증도 심한가요?',{
 yes:O([R('fracture_dislocation','strong','큰 충격 이후 발목 전체가 매우 심하게 붓고 통증도 심해, 골절·탈구 여부를 의료진이 영상 검사로 확인해야 합니다.')]),
 no:'A9Q5',
 unknown:'A9Q5',
}));
an(Q('A9Q5','통증이 실제로 특정 한쪽에 더 집중되나요?',{
 multi:[
  {id:'lateral',label:'바깥쪽',icon:'→'},
  {id:'medial',label:'안쪽',icon:'←'},
  {id:'anterolateral',label:'앞위쪽',icon:'↗'},
  {id:'back',label:'뒤쪽',icon:'↩'},
  {id:'whole',label:'전체',icon:'◎'},
 ],
 lateral:'A1Q4',
 medial:'A4Q4',
 anterolateral:'A5Q4',
 back:'A8Q4',
 whole:NO_PATTERN('큰 충격 이후 발목 전체 통증으로, 현재 PDF만으로는 골절/탈구 이외의 특정 손상으로 더 좁히기 어렵습니다. 영상 검사를 포함한 진료가 필요합니다.'),
}));

/* ---- A10. 반복 운동인데 Achilles가 아닌 위치 (자료 근거 부족) ---- */
an(Q('A10Q4','한 번의 접질림이나 충격 없이 서서히 생겼나요?',{
 yes:O([R('overuse_general_ankle','partial','반복 활동으로 발생한 발목 통증으로 기록합니다. 현재 자료만으로는 특정 발목 손상 패턴으로 좁히기 어렵습니다.')]),
 no:NO_PATTERN('실제로는 특정 사고(급성 기전)가 있었을 수 있어, 처음 상황 선택을 다시 확인해 보시는 것을 권장합니다.'),
 unknown:NO_PATTERN('정보가 불충분합니다.'),
}));

/* ---- 일반형(자료에 해당 조합이 없는 경우) ---- */
an(Q('AG_SWELL','다친 뒤 발목이 붓거나 멍이 들었나요?',{ yes:'AG_WB', no:'AG_WB', unknown:'AG_WB' }));
an(Q('AG_WB','체중을 싣고 걷기가 어렵나요?',{
 yes:O([R('soft_tissue_general_ankle','partial','체중부하가 어려워 정밀 진료가 필요합니다.')]),
 no:O([R('soft_tissue_general_ankle','partial','현재 선택하신 기전·위치 조합은 자료에 세부 기준이 없어, 일반적인 연부조직 손상으로 기록합니다.')]),
 unknown:NO_PATTERN(),
}));

/* =====================================================================
 * Trigger × Location → 엔진 진입점 매핑
 * ===================================================================== */
function kneeEntry(moi:string, location:string):EngineNode {
 if (moi==='impact') {
  if (location==='front_patellar') return KNEE_NODES['K1Q4'];
  if (location==='inner_whole') return KNEE_NODES['K2Q4'];
  if (location==='outer_whole') return KNEE_NODES['K3Q4'];
  if (location==='inner_joint_line') return KNEE_NODES['K4MQ4'];
  if (location==='outer_joint_line') return KNEE_NODES['K4LQ4'];
 }
 if (moi==='twist') {
  if (location==='inner_joint_line') return KNEE_NODES['K4MQ4'];
  if (location==='outer_joint_line') return KNEE_NODES['K4LQ4'];
  if (location==='deep_whole') return KNEE_NODES['K6Q4'];
 }
 if (moi==='stop_cut' && location==='deep_whole') return KNEE_NODES['K6Q4'];
 if (moi==='hyperextend') return KNEE_NODES['K6Q4'];
 if (moi==='fall_bent' && location==='back') return KNEE_NODES['K8Q4'];
 if (moi==='daily_repetitive' && location==='front_patellar') return KNEE_NODES['K11Q4'];
 if (moi==='run_jump_kneel') {
  if (location==='tibial_tuberosity') return KNEE_NODES['K9Q4'];
  if (location==='below_patellar') return KNEE_NODES['K10Q4'];
 }
 if (moi==='forceful_extend' && location==='below_patellar') return KNEE_NODES['K13Q4'];
 if (moi==='repeated_trauma') return KNEE_NODES['K14Q4'];
 if (moi==='gradual_overuse' && (location==='inner_whole' || location==='outer_whole')) return KNEE_NODES['K15Q4'];
 return KNEE_NODES['KG_SWELL'];
}
function ankleEntry(moi:string, location:string):EngineNode {
 if (moi==='inversion') {
  if (location==='lateral_malleolus') return ANKLE_NODES['A1Q4'];
  if (location==='achilles_back') return ANKLE_NODES['A3Q4'];
 }
 if (moi==='eversion' && location==='medial_malleolus') return ANKLE_NODES['A4Q4'];
 if (moi==='rotation_dorsi') {
  if (location==='anterolateral_upper') return ANKLE_NODES['A5Q4'];
  if (location==='achilles_back') return ANKLE_NODES['A6Q_LOC'];
 }
 if (moi==='overstretch' && location==='achilles_back') return ANKLE_NODES['A3Q4'];
 if (moi==='sudden_stopgo' && location==='achilles_back') return ANKLE_NODES['A7Q4'];
 if (moi==='gradual_achilles' && location==='achilles_back') return ANKLE_NODES['A8Q4'];
 if (moi==='high_impact' && location==='whole_ankle') return ANKLE_NODES['A9Q4'];
 if (moi==='repetitive_overuse' && location!=='achilles_back') return ANKLE_NODES['A10Q4'];
 return ANKLE_NODES['AG_SWELL'];
}
function engineEntry():EngineNode {
 if (state.part==='knee') return kneeEntry(state.moi, state.location);
 if (state.part==='ankle') return ankleEntry(state.moi, state.location);
 return O([], '해당 부위는 현재 자료(무릎/발목 PDF) 범위 밖이라 세부 질문을 제공하지 않습니다.');
}

/* =====================================================================
 * 상태
 * ===================================================================== */
const empty = ():InjuryState => ({
 story:'', part:'', moi:'', location:'', pain:0,
 redFlags:{deformity:'unknown',weightBearing:'unknown',sensation:'unknown',locking:'unknown'},
 engineCurrent:null, engineHistory:[], engineAnswers:[], engineOutcome:null,
});
let state=empty(), screen='home', recognition:SpeechRecognitionLike|null=null, isListening=false, stopVoice=false, finalTranscript='';
const root=document.querySelector<HTMLDivElement>('#app')!;
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]??c));
const go=(next:string)=>{screen=next;render();window.scrollTo({top:0,behavior:'smooth'});};
const toast=(message:string)=>{const el=document.querySelector('#toast');if(el){el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600);}};

/* =====================================================================
 * 헬퍼
 * ===================================================================== */
function partLabel():string{return state.part==='knee'?'무릎':state.part==='ankle'?'발목':'다친 부위';}
function optionLabel(list:Option[],id:string):string{return list.find(o=>o.id===id)?.label ?? id;}
function moiListFor(p:BodyPart):Option[]{return p==='knee'?KNEE_MOI:p==='ankle'?ANKLE_MOI:[];}
function locationListFor(p:BodyPart):Option[]{return p==='knee'?KNEE_LOCATION:p==='ankle'?ANKLE_LOCATION:[];}
function infoFor(patternId:string):InjuryInfo {
 return (state.part==='knee'?KNEE_INFO[patternId]:ANKLE_INFO[patternId]) ?? {name:patternId,specialty:'정형외과',confirm:'의료진 진찰이 필요합니다.'};
}
function tierLabel(t:Tier):string{return t==='strong'?'높음':t==='partial'?'중간':'의료진 확인 필요';}

/* =====================================================================
 * 감별 엔진 진행 로직
 * ===================================================================== */
function startEngine(){
 state.engineHistory=[];
 state.engineAnswers=[];
 state.engineOutcome=null;
 state.engineCurrent=engineEntry();
 if(state.engineCurrent.kind==='outcome'){ state.engineOutcome=state.engineCurrent; go('safety'); return; }
 go('engine');
}
function answerEngine(choiceKey:string, label:string){
 const cur=state.engineCurrent;
 if(!cur || cur.kind!=='question')return;
 state.engineAnswers.push({prompt:cur.prompt, answer:label});
 const target=cur.branch[choiceKey];
 if(target===undefined){toast('선택할 수 없는 답변이에요.');return;}
 const next=resolve(target);
 state.engineHistory.push(cur);
 state.engineCurrent=next;
 if(next.kind==='outcome'){ state.engineOutcome=next; go('safety'); return; }
 render();
}
function backEngine(){
 if(state.engineHistory.length){
  state.engineAnswers.pop();
  state.engineCurrent=state.engineHistory.pop()!;
  render();
 } else {
  go('location');
 }
}

/* =====================================================================
 * 최종 평가
 * ===================================================================== */
function assess():Assessment{
 const f=state.redFlags,urgentSignals:string[]=[];
 if(f.deformity==='yes')urgentSignals.push(`${partLabel()} 모양이 변했거나 뼈가 튀어나와 보임`);
 if(f.weightBearing==='yes')urgentSignals.push('체중을 거의 지지하지 못하거나 걷기가 불가능함');
 if(f.sensation==='yes')urgentSignals.push(`다친 ${partLabel()} 아래가 저리거나 감각이 둔하고, 차갑거나 창백함`);
 if(f.locking==='yes')urgentSignals.push('걸리거나 펴지지 않음(잠김)');

 const outcome=state.engineOutcome;
 const ranked=[...(outcome?.results ?? [])].sort((a,b)=>{
  const order:Record<Tier,number>={strong:2,partial:1,refer:0};
  return order[b.tier]-order[a.tier];
 });
 const top=ranked[0];
 const topInfo=top?infoFor(top.patternId):undefined;
 /* "무슨 부상과 비슷한가"(패턴 매칭 강도)와 "얼마나 급한가"(응급도)는 서로 다른 질문이다.
  * 패턴이 strong으로 잡혔다는 건 그 손상과 특징이 많이 겹친다는 뜻일 뿐,
  * 그 손상이 항상 응급실 감이라는 뜻은 아니다(ACL 파열 의심도 대부분은 응급실이 아니라
  * "빠른 정형외과 진료"가 정답이다). 따라서 patternNeedsPromptEval은 urgent 판정에는
  * 쓰지 않고, "오늘 안에 진료가 필요한지"에만 반영한다. */
 const patternNeedsPromptEval=!!(top && top.tier==='strong' && topInfo?.urgent);

 /* 1) urgent(응급실 수준): 실제 위험 신호(변형/체중부하 불가/저림·창백/잠김)가 있거나
  *    통증이 9~10점일 때만. 패턴 매칭 결과만으로는 여기로 올리지 않는다. */
 const urgent=urgentSignals.length>0||state.pain>=9;

 /* 2) same-day(오늘 안에 병원): 응급 신호는 없지만 (a) 강하게 확인된 패턴이 조기 영상·전문
  *    검사를 필요로 하거나, (b) 체중부하 여부가 불확실하거나, (c) 통증이 꽤 심할 때.
  *    응급실行을 뜻하지는 않는다. */
 const sameDay=!urgent&&(patternNeedsPromptEval||f.weightBearing==='unknown'||state.pain>=7);

 /* 3) watch(경과 관찰): 응급·같은날 진료 기준에는 못 미치지만, 통증이 어느 정도 있거나
  *    이야기 속에 상태 변화를 시사하는 표현이 있어 며칠간 지켜볼 필요가 있는 경우.
  *    "점프", "충돌" 같은 흔한 동작 설명만으로는 병원 권고를 올리지 않는다 — 그런 단어는
  *    손상 기전을 묘사할 뿐 심각도를 의미하지 않기 때문이다. */
 const watch=!urgent&&!sameDay&&(state.pain>=6||/빠르게 붓|계속 붓|심하게 아프|뚝 소리|딱 소리|갈리는 느낌|잠기는 느낌|꺾이는 느낌/.test(state.story));

 const candidates:Candidate[]=ranked.length
  ?ranked.slice(0,3).map(r=>{const info=infoFor(r.patternId);return {name:info.name,confidence:tierLabel(r.tier),reason:r.note,confirm:info.confirm,urgent:info.urgent};})
  :[{name:state.part==='knee'?'무릎 주변 근육·힘줄의 과사용 또는 타박상':state.part==='ankle'?'발목 주변 연부조직 손상':'입력된 부위의 연부조직 손상',confidence:'낮음',reason:outcome?.fallbackNote??'현재 입력만으로는 특정 구조물을 확정하기 어렵습니다.',confirm:'통증 위치와 기능 변화를 기록하고 호전되지 않으면 진료를 받습니다.'}];
 while(candidates.length<3)candidates.push({name:'추가 확인이 필요한 손상',confidence:'낮음',reason:'현재 정보만으로는 다른 손상 가능성을 완전히 배제할 수 없습니다.',confirm:'통증과 기능 변화를 의료진에게 전달하세요.'});

 const severity:Severity=urgent?'urgent':sameDay?'same-day':watch?'watch':'mild';
 const specialty=urgent
  ?(topInfo?`${topInfo.specialty} 또는 응급실`:'정형외과 또는 응급실')
  :sameDay
  ?(topInfo?`${topInfo.specialty} (오늘 안에 방문 권장)`:'정형외과 (오늘 안에 방문 권장)')
  :(topInfo?topInfo.specialty:'정형외과·재활의학과 (통증 조절 중심이면 통증의학과)');
 return {
  severity,
  title:urgent?'지금은 병원 평가가 우선이에요':sameDay?'오늘 안에 병원에서 확인하세요':watch?'오늘 상태를 주의 깊게 관찰하세요':'현재는 초기 자가 관리부터 시작할 수 있어요',
  summary:urgent?'위험 신호가 있어 RICE만으로 지켜보면 안 됩니다.':sameDay?'지금 당장 응급 신호는 없지만, 확인된 패턴상 오늘 중으로 진료를 받아보는 게 안전해요.':watch?'경과를 기록하면서 48~72시간 안에 호전되는지 확인하세요.':'확정 진단은 아니지만, 현재 입력에서는 즉시 위험 신호가 확인되지 않았습니다.',
  candidates:candidates.slice(0,3),
  specialty,
  urgentSignals,
 };
}

/* =====================================================================
 * 음성 입력
 * ===================================================================== */
function startVoice(){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech)return toast('이 브라우저는 음성 입력을 지원하지 않아요. 아래에 직접 입력해 주세요.');if(isListening)return toast('계속 듣고 있어요. 다 말했으면 아래 버튼을 눌러 주세요.');recognition=new Speech();recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;stopVoice=false;recognition.onstart=()=>{isListening=true;render();};recognition.onresult=(event:SpeechRecognitionEventLike)=>{let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript;if(event.results[i].isFinal)finalTranscript+=text;else interim+=text;}state.story=finalTranscript+interim;updateStory();};recognition.onend=()=>{if(isListening&&!stopVoice){try{recognition?.start();}catch{/* already restarting */}}};recognition.onerror=(event:SpeechRecognitionErrorEventLike)=>{if(event.error==='not-allowed'){isListening=false;stopVoice=true;toast('마이크 권한을 허용해야 음성 입력을 사용할 수 있어요.');render();}};try{recognition.start();}catch{toast('음성 입력을 다시 눌러 주세요.');}}
function finishVoice(){stopVoice=true;isListening=false;recognition?.stop();finalTranscript=state.story;render();}
function updateStory(){const input=document.querySelector<HTMLTextAreaElement>('#story');if(input&&document.activeElement!==input)input.value=state.story;const status=document.querySelector('#voice-status');if(status)status.textContent=isListening?'듣는 중… 다 말했으면 아래 버튼을 눌러 주세요.':'상황을 짧게 말하거나 직접 입력해 주세요.';}

/* =====================================================================
 * 공통 UI 조각
 * ===================================================================== */
function choices(values:{id:string;label:string;icon:string}[],selected:string[],kind:string){return `<div class="choice-grid">${values.map(v=>`<button class="choice ${selected.includes(v.id)?'selected':''}" data-kind="${kind}" data-value="${v.id}"><span>${v.icon}</span><b>${v.label}</b></button>`).join('')}</div>`;}
function shell(content:string,progress=''){return `<header class="topbar"><a class="brand" href="#"><span class="brand-mark">A.T</span><span>나만의 A.T</span></a><a class="architecture-link" href="architecture.html">구조 보기 ↗</a></header><main class="shell">${progress?`<div class="progress"><span style="width:${progress}%"></span></div>`:''}${content}</main><div id="toast" class="toast" role="status"></div>`;}

/* =====================================================================
 * 화면
 * ===================================================================== */
function home(){return shell(`<section class="hero"><div class="hero-copy"><p class="eyebrow">선수와 보호자를 위한 스포츠 부상 가이드</p><h1>아픈 곳을 정확히 기록하고,<br><em>다음 행동</em>을 알 수 있게.</h1><p class="lead">다치신 상황(기전)과 통증 위치를 순서대로 골라 정확히 좁혀 드려요. 답변마다 다음 질문이 달라지는 감별 질문으로, 의료진에게 보여줄 기록과 24·48·72시간 경과 기준까지 한 번에 준비합니다.</p><button class="primary large" data-action="start">부상 기록 시작하기 <span>→</span></button><div class="trust"><span>✓ 확정 진단 아님</span><span>✓ 의료진 전달용 요약</span></div></div><div class="hero-art"><div class="orb"></div><img src="/assets/athlete-team-characters.png" alt="함께 운동하는 두 명의 선수 캐릭터"><div class="floating top">빠른 기록 <strong>1분</strong></div><div class="floating bottom">위험 신호 <strong>먼저 확인</strong></div></div></section>`);}
function intake(){return shell(`<section class="panel"><p class="eyebrow">01 · 상황 기록</p><h2>무슨 일이 있었는지<br><em>편하게 말해 주세요.</em></h2><p class="muted">정리된 문장보다 실제 상황이 더 좋아요. 말이 끊겨도 자동으로 끝나지 않아요.</p><div class="voice-box"><button class="voice" data-action="voice"><span class="mic">${isListening?'●':'⌕'}</span><b>${isListening?'듣는 중…':'눌러서 말하기'}</b><small id="voice-status">${isListening?'다 말했으면 아래 버튼을 눌러 주세요.':'예: 훈련 중 착지하다가 무릎 안쪽이 아파졌어요'}</small></button><button class="done" data-action="done" ${isListening?'':'disabled'}>다 말했음</button><textarea id="story" placeholder="또는 여기에 짧게 적어 주세요">${esc(state.story)}</textarea><div class="quick"><button data-action="story" data-value="달리다가 갑자기 아파졌어요">달리다가 아파짐</button><button data-action="story" data-value="점프 착지 후 아파졌어요">착지 후 아파짐</button><button data-action="story" data-value="부딪힌 뒤 붓고 아파요">충돌 후 붓기</button></div></div><div class="actions"><button class="text-button" data-action="home">처음으로</button><button class="primary" data-action="next-intake">다음 →</button></div></section>`,'12');}
function part(){return shell(`<section class="panel"><p class="eyebrow">02 · 부위 선택</p><h2>어느 부위가<br><em>불편한가요?</em></h2><p class="muted">부위를 고르면 다치신 상황(기전)부터 순서대로 확인해요.</p>${choices([{id:'knee',label:'무릎',icon:'🦵'},{id:'ankle',label:'발목',icon:'🦶'},{id:'other',label:'기타 부위',icon:'＋'}],state.part?[state.part]:[],'part')}<div class="actions"><button class="text-button" data-action="back-intake">← 이전</button><button class="primary" data-action="next-part">다음 →</button></div></section>`,'24');}
function moi(){const options=moiListFor(state.part),pl=partLabel();return shell(`<section class="panel"><p class="eyebrow">03 · 손상 기전</p><h2>${pl}을(를) 어떤 상황에서<br><em>다치셨거나 아팠나요?</em></h2><p class="muted">가장 비슷한 상황을 하나 골라 주세요. 이후 질문은 이 답변에 따라 달라져요.</p>${choices(options,state.moi?[state.moi]:[],'moi')}<div class="actions"><button class="text-button" data-action="back-part">← 이전</button><button class="primary" data-action="next-moi">다음 →</button></div></section>`,'36');}
function location(){const options=locationListFor(state.part),pl=partLabel();return shell(`<section class="panel"><p class="eyebrow">04 · 통증 위치</p><h2>${pl} 중에서도<br><em>지금 가장 아픈 곳은 어디인가요?</em></h2><p class="muted">앞서 고른 상황과 상관없이, 가장 가까운 위치를 하나 골라 주세요.</p>${choices(options,state.location?[state.location]:[],'location')}<div class="actions"><button class="text-button" data-action="back-moi">← 이전</button><button class="primary" data-action="next-location">다음 →</button></div></section>`,'48');}
function engineScreen(){
 const node=state.engineCurrent;
 if(!node || node.kind!=='question')return shell('<section class="panel"><p class="muted">질문을 불러오지 못했어요.</p></section>');
 const answered=state.engineAnswers.length;
 const body=node.multi
  ?`<div class="question"><h3>${node.prompt}</h3>${node.hint?`<p class="muted">${node.hint}</p>`:''}${choices(node.multi,[],'engine-multi')}</div>`
  :`<div class="question"><h3>${node.prompt}</h3>${node.hint?`<p class="muted">${node.hint}</p>`:''}<div class="segmented engine-segmented">${(['yes','unknown','no'] as Choice[]).map(v=>`<button data-action="engine-answer" data-key="${v}" data-label="${v==='yes'?(node.yesLabel??'네'):v==='no'?(node.noLabel??'아니요'):(node.unknownLabel??'모르겠어요')}">${v==='yes'?(node.yesLabel??'네'):v==='no'?(node.noLabel??'아니요'):(node.unknownLabel??'모르겠어요')}</button>`).join('')}</div></div>`;
 return shell(`<section class="panel"><p class="eyebrow">05 · 구별 질문 ${answered?`· ${answered+1}번째`:''}</p><h2>몇 가지만 더<br><em>구체적으로 확인할게요.</em></h2><p class="muted">앞서 답하신 내용에 따라 다음 질문이 바뀌어요. "모르겠어요"도 정확한 답이니 편하게 골라 주세요.</p>${body}<div class="actions"><button class="text-button" data-action="engine-back">← 이전</button></div></section>`,'62');
}
function safety(){const pl=partLabel();const labels=[{key:'deformity',icon:'⚠',title:`${pl} 모양이 변했거나 심하게 부었나요?`,hint:'뼈가 튀어나오거나 빠르게 커지는 부종'},{key:'weightBearing',icon:'🚶',title:'체중을 싣고 걸을 수 있나요?',hint:'거의 못 걷거나 계속 꺾이는 느낌이 있는 경우'},{key:'sensation',icon:'◌',title:`다친 ${pl} 아래가 저리거나 차가운가요?`,hint:'발가락·발끝 저림·감각 저하·차가움·창백함'},{key:'locking',icon:'▣',title:`${pl}이 걸려 펴지지 않나요?`,hint:'잠김이 생겨 굽히거나 펴기 어려운 경우'}];return shell(`<section class="panel"><p class="eyebrow">06 · 위험 신호 먼저 확인</p><h2>지금 바로 병원에 갈<br><em>신호가 있는지 봐요.</em></h2><p class="muted">모호하게 “상태가 나쁘면”이 아니라, 행동 기준으로 안내할게요.</p><div class="safety-list">${labels.map(item=>`<div class="safety-row"><span class="safety-icon">${item.icon}</span><div><b>${item.title}</b><small>${item.hint}</small></div><div class="segmented">${(['no','unknown','yes'] as Choice[]).map(v=>`<button class="${state.redFlags[item.key as keyof InjuryState['redFlags']]===v?'selected':''}" data-action="flag" data-key="${item.key}" data-value="${v}">${v==='yes'?'있어요':v==='no'?'없어요':'모르겠어요'}</button>`).join('')}</div></div>`).join('')}</div><div class="actions"><button class="text-button" data-action="back-safety">← 이전</button><button class="primary" data-action="next-safety">통증 정도 입력 →</button></div></section>`,'80');}
function pain(){return shell(`<section class="panel compact"><p class="eyebrow">07 · 통증 기록</p><h2>지금 통증은<br><em>어느 정도인가요?</em></h2><p class="muted">0은 통증 없음, 10은 참기 힘든 가장 심한 통증이에요.</p><div class="pain-grid">${[1,3,5,7,9].map(n=>`<button class="pain ${state.pain===n?'selected':''}" data-action="pain" data-value="${n}"><strong>${n}</strong><span>${n<=3?'가벼움':n<=5?'불편함':n<=7?'많이 아픔':'매우 아픔'}</span></button>`).join('')}</div><div class="actions"><button class="text-button" data-action="back-pain">← 이전</button><button class="primary" data-action="result">내 결과 보기 →</button></div></section>`,'90');}
function exerciseBlock():string{if(state.part==='ankle')return `<div class="exercise"><b>통증이 날카롭지 않고 심한 불안정감이 없을 때만</b><p>발목으로 알파벳을 그리듯 통증이 없는 범위에서 천천히 움직이기를 10회, 하루 2~3세트. 통증이 증가하면 중단하세요.</p></div>`;if(state.part==='knee')return `<div class="exercise"><b>통증이 날카롭지 않고 잠김·불안정성이 없을 때만</b><p>무릎을 편 채 허벅지 앞에 힘을 주고 5초 유지 → 10회, 하루 2~3세트. 통증이 증가하면 중단하세요.</p></div>`;return '';}
function riceSteps(){return `<div class="rice"><div><span>①</span><b>Rest · 쉬기</b><p>운동을 멈추고 체중 부하를 줄여요. 통증이 나는 동작·달리기·점프는 중단하세요.</p></div><div><span>②</span><b>Ice · 냉찜질</b><p>수건으로 감싼 얼음팩을 15~20분, 하루 3~5회. 피부에 직접 대지 않아요.</p></div><div><span>③</span><b>Compression · 압박</b><p>붕대를 아래에서 위로 편하게 감아요. 저림·창백함·통증 증가 시 즉시 풀어요.</p></div><div><span>④</span><b>Elevation · 올리기</b><p>누워서 다친 부위를 심장보다 높게 받쳐 부종을 줄여요.</p></div></div>`;}
function rice(a:Assessment){
 if(a.severity==='urgent')return `<div class="urgent-box"><b>지금은 자가 처치보다 진료가 먼저예요</b><p>다친 부위를 억지로 펴거나 맞추지 말고, 운동을 중단한 채 보호자·코치와 함께 정형외과 또는 응급실로 이동하세요.</p></div>`;
 if(a.severity==='same-day')return `<div class="sameday-box"><b>RICE로 관리하면서 오늘 안에 진료를 예약하세요</b><p>지금 당장 응급 신호는 없지만, 확인된 손상 패턴상 오늘 중으로 정형외과에서 확인받는 게 안전해요. 그동안 아래 RICE 처치를 함께 진행하세요.</p></div>${riceSteps()}${exerciseBlock()}`;
 return `${riceSteps()}${exerciseBlock()}`;
}
function result(){const a=assess(),label=a.severity==='urgent'?'심각':a.severity==='same-day'?'빠른 확인 필요':a.severity==='watch'?'주의':'경미';return shell(`<section class="result"><div class="result-top ${a.severity}"><span class="status-icon">${a.severity==='urgent'?'!':a.severity==='same-day'?'◑':a.severity==='watch'?'◐':'✓'}</span><div><p class="eyebrow">평가 결과 · ${label}</p><h2>${a.title}</h2><p>${a.summary}</p></div></div><div class="timeline"><div><b>지금</b><span>운동 중단<br>상태 기록</span></div><div><b>24시간</b><span>통증·부종<br>변화 확인</span></div><div class="active"><b>48시간</b><span>호전 없으면<br>진료 전환</span></div><div><b>72시간</b><span>지속·악화 시<br>병원 방문</span></div></div><div class="result-grid"><article class="card candidates"><div class="card-head"><span>01</span><h3>예상 부상 후보</h3></div>${a.candidates.map((c,i)=>`<div class="candidate"><div class="rank">${i+1}</div><div><b>${c.name}</b><em>${c.confidence}</em><p>${c.reason}</p><small>진료에서 확인: ${c.confirm}</small></div></div>`).join('')}</article><article class="card"><div class="card-head"><span>02</span><h3>지금 당장 할 처치</h3></div>${rice(a)}</article><article class="card warning"><div class="card-head"><span>03</span><h3>이럴 땐 바로 병원 가세요</h3></div><ul>${a.urgentSignals.length?a.urgentSignals.map(s=>`<li>${s}</li>`).join(''):'<li><b>48~72시간</b> RICE 후에도 통증·부종이 줄지 않거나 더 심해질 때</li><li>체중을 싣기 힘들어지거나 갑자기 힘이 빠지거나 덜컥 빠지는 느낌이 새로 생길 때</li><li>발가락·발끝 저림·감각 저하·차가워지거나 창백해질 때</li><li>걸려서 펴지지도 굽혀지지도 않을 때</li>'}</ul><div class="specialty"><b>권장 진료과</b><span>${a.specialty}</span><small>응급 신호는 예약을 기다리지 말고 즉시 진료받으세요.</small></div></article></div><div class="result-actions"><button class="primary" data-action="report">의료진 전달용 요약 만들기</button><button class="secondary" data-action="restart">새 기록 시작</button></div><p class="disclaimer">본 결과는 의료진의 진단을 대체하지 않는 보조적 참고 안내입니다. 15세 이하 사용자는 보호자·코치에게 즉시 공유하세요.</p></section>`);}
function report(){
 const a=assess(),pl=partLabel();
 const hasDetail=state.part==='knee'||state.part==='ankle';
 const moiLabel=hasDetail?optionLabel(moiListFor(state.part),state.moi):'';
 const locLabel=hasDetail?optionLabel(locationListFor(state.part),state.location):'';
 const answersLabel=state.engineAnswers.length?state.engineAnswers.map(a=>`${a.prompt} → ${a.answer}`).join(' / '):'추가 질문 없음';
 return shell(`<section class="panel report"><p class="eyebrow">의료진 전달용 요약</p><h2>진료 전에 이 화면을<br><em>보여 주세요.</em></h2><div class="report-card"><div class="report-brand"><span class="brand-mark">A.T</span><b>나만의 A.T 부상 기록</b></div><div><small>상황</small><b>${esc(state.story||'상황 미입력')}</b></div><div><small>부위</small><b>${pl}</b></div>${hasDetail?`<div><small>손상 기전</small><b>${moiLabel}</b></div><div><small>통증 위치</small><b>${locLabel}</b></div>`:''}<div><small>통증 / 위험도</small><b>${state.pain}/10 · ${a.severity==='urgent'?'심각':a.severity==='same-day'?'빠른 확인 필요':a.severity==='watch'?'주의':'경미'}</b></div><div><small>우선 감별 후보</small><b>${a.candidates.map(c=>c.name).join(' / ')}</b></div><div><small>구별 질문 답변</small><b>${esc(answersLabel)}</b></div></div><button class="primary full" data-action="copy">요약 내용 복사하기</button><button class="text-button full" data-action="back-result">← 결과로 돌아가기</button></section>`,'100');
}

/* =====================================================================
 * 렌더 & 이벤트 바인딩
 * ===================================================================== */
function render(){
 root.innerHTML=screen==='home'?home()
  :screen==='intake'?intake()
  :screen==='part'?part()
  :screen==='moi'?moi()
  :screen==='location'?location()
  :screen==='engine'?engineScreen()
  :screen==='safety'?safety()
  :screen==='pain'?pain()
  :screen==='result'?result()
  :report();
 bind();
}
function bind(){
 root.querySelectorAll<HTMLElement>('[data-action]').forEach(el=>el.addEventListener('click',()=>{
  const a=el.dataset.action;
  if(a==='start')go('intake');
  if(a==='home'||a==='restart'){state=empty();finalTranscript='';go('home');}
  if(a==='voice')startVoice();
  if(a==='done')finishVoice();
  if(a==='story'){state.story=el.dataset.value??'';finalTranscript=state.story;render();}
  if(a==='next-intake'){const input=document.querySelector<HTMLTextAreaElement>('#story');state.story=input?.value.trim()||state.story;go('part');}
  if(a==='back-intake')go('intake');
  if(a==='next-part'){
   if(!state.part)return toast('먼저 부위를 선택해 주세요.');
   if(state.part==='other'){go('safety');}else{go('moi');}
  }
  if(a==='back-part')go('part');
  if(a==='next-moi'){if(!state.moi)return toast('가장 비슷한 상황을 하나 선택해 주세요.');go('location');}
  if(a==='back-moi')go('moi');
  if(a==='next-location'){if(!state.location)return toast('통증 위치를 하나 선택해 주세요.');startEngine();}
  if(a==='back-location')go('location');
  if(a==='engine-back')backEngine();
  if(a==='next-safety')go('pain');
  if(a==='back-safety'){
   if(state.part==='other')go('part');
   else if(state.engineHistory.length||state.engineOutcome)go('engine');
   else go('location');
  }
  if(a==='back-pain')go('safety');
  if(a==='result')state.pain?go('result'):toast('통증 정도를 선택해 주세요.');
  if(a==='report')go('report');
  if(a==='back-result')go('result');
  if(a==='flag'){state.redFlags[el.dataset.key as keyof InjuryState['redFlags']]=el.dataset.value as Choice;render();}
  if(a==='pain'){state.pain=Number(el.dataset.value);render();}
  if(a==='engine-answer'){const key=el.dataset.key,label=el.dataset.label??'';if(key)answerEngine(key,label);}
  if(a==='copy'){navigator.clipboard?.writeText(document.querySelector('.report-card')?.textContent??'');toast('요약을 복사했어요.');}
 }));
 root.querySelectorAll<HTMLTextAreaElement>('#story').forEach(el=>el.addEventListener('input',()=>{state.story=el.value;finalTranscript=el.value;}));
 root.querySelectorAll<HTMLElement>('[data-kind="part"]').forEach(el=>el.addEventListener('click',()=>{state.part=el.dataset.value as BodyPart;state.moi='';state.location='';render();}));
 root.querySelectorAll<HTMLElement>('[data-kind="moi"]').forEach(el=>el.addEventListener('click',()=>{state.moi=el.dataset.value??'';render();}));
 root.querySelectorAll<HTMLElement>('[data-kind="location"]').forEach(el=>el.addEventListener('click',()=>{state.location=el.dataset.value??'';render();}));
 root.querySelectorAll<HTMLElement>('[data-kind="engine-multi"]').forEach(el=>el.addEventListener('click',()=>{const key=el.dataset.value??'';const label=el.querySelector('b')?.textContent??key;answerEngine(key,label);}));
}
declare global{interface Window{SpeechRecognition?:SpeechRecognitionConstructor;webkitSpeechRecognition?:SpeechRecognitionConstructor}}
render();
