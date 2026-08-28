export const T2I_TEMPLATE_IDS = [
  "live-onair",
  "pk-battle",
  "stage-sync",
  "practice-room",
  "coach-hands-on",
  "makeup-desk",
  "backstage-wait",
  "offair-late",
  "base-life",
  "crew-camera",
  "poster-blank",
] as const

export type T2iTemplateId = (typeof T2I_TEMPLATE_IDS)[number]

export type GroupType = "girl" | "boy" | "mixed"
export type StageTheme = "pop" | "guofeng" | "edm"
export type PeopleCount = "4" | "5" | "6" | "7"
export type Energy = "calm" | "high" | "direct"
export type Tone = "clean" | "neon" | "glow"
export type MoneyCue = "none" | "gift" | "rank" | "phones"
export type Viewpoint = "bystander" | "phone" | "selfie"
export type PkBeat = "win" | "tense" | "lose"
export type OffairBeat = "collapse" | "snack" | "empty"
export type PracticeStatus = "learn" | "correct" | "rest"
export type NewbieCount = "2" | "3" | "4"
export type CoachGender = "female" | "male"
export type MakeupStage = "bare" | "done" | "wardrobe"
export type BaseScene = "canteen" | "dorm"
export type CrewRole = "camera" | "lighting" | "director" | "choreo"
export type BlankSide = "bottom" | "top"

export type T2iSlots = {
  groupType: GroupType
  theme: StageTheme
  count: PeopleCount
  energy: Energy
  tone: Tone
  moneyCue: MoneyCue
  viewpoint: Viewpoint
  pkBeat: PkBeat
  offairBeat: OffairBeat
  practiceStatus: PracticeStatus
  newbieCount: NewbieCount
  coachGender: CoachGender
  makeupStage: MakeupStage
  baseScene: BaseScene
  crewRole: CrewRole
  blankSide: BlankSide
}

export type T2iSlotKey = keyof T2iSlots

type SlotOption<T extends string> = { value: T; label: string }

export const SLOT_DEFS: { [K in T2iSlotKey]: { label: string; options: SlotOption<T2iSlots[K]>[] } } =
  {
    groupType: {
      label: "团型",
      options: [
        { value: "girl", label: "女团" },
        { value: "boy", label: "男团" },
        { value: "mixed", label: "混团" },
      ],
    },
    theme: {
      label: "主题",
      options: [
        { value: "pop", label: "潮流舞台" },
        { value: "guofeng", label: "古风" },
        { value: "edm", label: "电音" },
      ],
    },
    count: {
      label: "人数",
      options: [
        { value: "4", label: "4" },
        { value: "5", label: "5" },
        { value: "6", label: "6" },
        { value: "7", label: "7" },
      ],
    },
    energy: {
      label: "情绪",
      options: [
        { value: "high", label: "高能欢呼" },
        { value: "direct", label: "直视镜头" },
        { value: "calm", label: "克制纪实" },
      ],
    },
    tone: {
      label: "调性",
      options: [
        { value: "neon", label: "荧光粉紫" },
        { value: "glow", label: "过曝美颜" },
        { value: "clean", label: "干净日光" },
      ],
    },
    moneyCue: {
      label: "收益",
      options: [
        { value: "gift", label: "礼物特效" },
        { value: "rank", label: "榜单虚化" },
        { value: "phones", label: "手机墙" },
        { value: "none", label: "不露" },
      ],
    },
    viewpoint: {
      label: "视角",
      options: [
        { value: "phone", label: "手机画面" },
        { value: "bystander", label: "旁观机位" },
        { value: "selfie", label: "自拍视角" },
      ],
    },
    pkBeat: {
      label: "战况",
      options: [
        { value: "win", label: "刚赢" },
        { value: "tense", label: "胶着" },
        { value: "lose", label: "落后催票" },
      ],
    },
    offairBeat: {
      label: "时刻",
      options: [
        { value: "collapse", label: "瘫在地上" },
        { value: "snack", label: "夜宵" },
        { value: "empty", label: "空舞台" },
      ],
    },
    practiceStatus: {
      label: "状态",
      options: [
        { value: "learn", label: "学新舞" },
        { value: "correct", label: "纠动作" },
        { value: "rest", label: "休息" },
      ],
    },
    newbieCount: {
      label: "新人",
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
    },
    coachGender: {
      label: "教练",
      options: [
        { value: "female", label: "女教练" },
        { value: "male", label: "男教练" },
      ],
    },
    makeupStage: {
      label: "环节",
      options: [
        { value: "bare", label: "妆前清爽" },
        { value: "done", label: "定妆完成" },
        { value: "wardrobe", label: "选衣服" },
      ],
    },
    baseScene: {
      label: "地点",
      options: [
        { value: "canteen", label: "食堂" },
        { value: "dorm", label: "宿舍公共区" },
      ],
    },
    crewRole: {
      label: "岗位",
      options: [
        { value: "camera", label: "运镜" },
        { value: "lighting", label: "灯光" },
        { value: "director", label: "导播" },
        { value: "choreo", label: "编舞" },
      ],
    },
    blankSide: {
      label: "留白",
      options: [
        { value: "bottom", label: "底部" },
        { value: "top", label: "顶部" },
      ],
    },
  }

/**
 * 提示词分层。合规不靠否定句实现：着装写成具体正向描述、年龄写成"二十岁出头"，
 * 因为当前生成引擎没有 --negative-prompt，否定词只会污染正向语义。
 */
type PromptLayers = {
  subject: string
  scene: string
  light: string
  energy: string
  money?: string
  camera: string
}

export type T2iTemplate = {
  id: T2iTemplateId
  title: string
  blurb: string
  slots: T2iSlotKey[]
  assemble: (slots: T2iSlots) => PromptLayers
}

const SPEC_LAYER = "小红书竖图 3:4，写实摄影，手机直出质感，人脸清晰锐利，皮肤保留真实纹理"
const EXCLUDE_LAYER = "画面里不出现可辨认的文字、水印、logo 和二维码"

const LAYER_ORDER: { label: string; key: keyof PromptLayers | "spec" | "exclude" }[] = [
  { label: "画面", key: "spec" },
  { label: "主体", key: "subject" },
  { label: "场景", key: "scene" },
  { label: "光线", key: "light" },
  { label: "情绪", key: "energy" },
  { label: "收益", key: "money" },
  { label: "镜头", key: "camera" },
  { label: "排除", key: "exclude" },
]

const COUNT_WORD: Record<PeopleCount, string> = {
  "4": "四名",
  "5": "五名",
  "6": "六名",
  "7": "七名",
}

const NEWBIE_WORD: Record<NewbieCount, string> = {
  "2": "两名",
  "3": "三名",
  "4": "四名",
}

const ENERGY_TEXT: Record<Energy, string> = {
  calm: "情绪克制，纪实感，注意力全在动作上，没人看镜头",
  high: "情绪拉到最满，张嘴大笑、抬手欢呼，有人跳起来，头发被甩起",
  direct: "至少两个人直视镜头，眼神有强烈镜头感，笑得毫无保留",
}

const TONE_TEXT: Record<Tone, string> = {
  clean: "色调干净通透，接近日光白平衡",
  neon: "高饱和荧光粉与紫色主导，色彩浓烈对比强，像手机直拍直播间的原始色彩",
  glow: "轻微过曝，高光发白，美颜相机那种柔亮通透质感",
}

const MONEY_TEXT: Record<MoneyCue, string> = {
  none: "",
  gift: "打赏礼物特效正从画面下方往上飘，表现为彩色光斑、星点和半透明光带，被镜头轻微虚化成纯色彩形状",
  rank: "背景竖屏上是虚化的排行榜界面，只看得到一条条彩色色块和圆形头像，字迹完全虚掉无法辨认",
  phones: "旁边支架上架着好几台手机同时开播，屏幕蓝光从侧面打在脸上",
}

const VIEWPOINT_TEXT: Record<Viewpoint, string> = {
  bystander: "第三方旁观机位，中景，轻微手持晃动",
  phone: "构图模拟手机直播画面，竖屏、镜头略微仰拍、人物占满画幅，边缘有轻微广角畸变",
  selfie: "自拍臂展视角，镜头很近，最前面的人脸略大略变形",
}

function groupWho(group: GroupType): string {
  if (group === "girl") return "二十岁出头的年轻女生"
  if (group === "boy") return "二十岁出头的年轻男生"
  return "二十岁出头的年轻男女"
}

function people(group: GroupType, count: PeopleCount): string {
  return `${COUNT_WORD[count]}${groupWho(group)}`
}

type ThemeLook = { dress: string; set: string; light: string }

const THEME_LOOK: Record<StageTheme, ThemeLook> = {
  pop: {
    dress: "亮片高领长袖上衣配高腰阔腿裤和白色短靴",
    set: "身后是 LED 巨幕和两侧竖屏，地面轻微反光",
    light: "彩色桁架灯，粉紫为主色，光束边缘清晰",
  },
  guofeng: {
    dress: "改良汉元素长袖舞台服配水袖和绣花马面裙",
    set: "身后是屏风与漆器置景，是直播间内景不是古装剧外景",
    light: "暖橙色舞台灯，光束里浮着细小尘埃",
  },
  edm: {
    dress: "反光机能面料舞台外套配工装长裤和机能靴",
    set: "身后是裸露金属桁架，地面浮着一层低矮烟雾",
    light: "冷蓝紫色光束横向扫过，带轻微频闪",
  },
}

function assembleLiveOnair(slots: T2iSlots): PromptLayers {
  return {
    subject: `${people(slots.groupType, slots.count)}穿着统一应援色长袖短外套和高腰长裤，戴着入耳式耳麦，横排面朝镜头跳同一段副歌，中间一人站主位`,
    scene:
      "团播直播间里环形补光灯正对着人脸，身后是彩色 LED 竖屏和亚克力装饰墙，地面有反光",
    light: TONE_TEXT[slots.tone],
    energy: ENERGY_TEXT[slots.energy],
    money: MONEY_TEXT[slots.moneyCue],
    camera: VIEWPOINT_TEXT[slots.viewpoint],
  }
}

// 情绪层由战况决定，不暴露 energy 槽位：否则会出现「暂时落后」配「张嘴大笑」这种互相抵消的描述。
const PK_BEAT: Record<PkBeat, { action: string; energy: string }> = {
  win: {
    action: "刚刚赢下这一局，全员起跳、张嘴喊出来，有两个人抱在一起",
    energy: "情绪拉到最满，头发被甩起，动作还没收住",
  },
  tense: {
    action: "比分胶着，所有人盯着监视器，手攥紧",
    energy: "紧张到屏住呼吸，眉头皱着，没人说话",
  },
  lose: {
    action: "暂时落后，几个人凑到镜头前把动作幅度加到最大催票",
    energy: "表情夸张卖力，带一点着急和不服输",
  },
}

function assemblePkBattle(slots: T2iSlots): PromptLayers {
  const beat = PK_BEAT[slots.pkBeat]
  return {
    subject: `${people(slots.groupType, slots.count)}穿着统一应援色长袖舞台服，戴着耳麦，${beat.action}`,
    scene:
      "团播直播间的 PK 环节，侧前方监视器上是左右分屏的对战画面，进度条只剩虚化的两段色块",
    light: TONE_TEXT.neon,
    energy: beat.energy,
    money: MONEY_TEXT[slots.moneyCue],
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleStageSync(slots: T2iSlots): PromptLayers {
  const look = THEME_LOOK[slots.theme]
  return {
    subject: `${people(slots.groupType, slots.count)}穿着${look.dress}，在专业直播舞台上横排面朝主机位齐舞，中间一人站主位动作幅度更大`,
    scene: look.set,
    light: look.light,
    energy: ENERGY_TEXT[slots.energy],
    money: MONEY_TEXT[slots.moneyCue],
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assemblePracticeRoom(slots: T2iSlots): PromptLayers {
  const status =
    slots.practiceStatus === "correct"
      ? "正在纠动作，一个人被指出细节，其他人在旁边跟着比划"
      : slots.practiceStatus === "rest"
        ? "坐在地上喝水休息，有人低头看手机回放刚才录的视频"
        : "正在学新舞，对着镜子一句一句抠动作"
  return {
    subject: `${people(slots.groupType, slots.count)}穿着宽松短袖 T 恤、高腰运动长裤和球鞋，${status}`,
    scene: "练舞室里有一整面墙的镜子、木地板、把杆和天花板日光灯，墙角堆着水瓶和外套",
    light: TONE_TEXT.clean,
    energy: ENERGY_TEXT[slots.energy],
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleCoachHandsOn(slots: T2iSlots): PromptLayers {
  const coach = slots.coachGender === "male" ? "男舞蹈教练" : "女舞蹈教练"
  const who = groupWho(slots.groupType)
  return {
    subject: `一位三十岁左右的${coach}正面示范动作，${NEWBIE_WORD[slots.newbieCount]}${who}穿着短袖 T 恤和运动长裤在后面跟做，镜子里能看到整排人`,
    scene: "练舞室里有镜面墙、木地板、把杆和天花板日光灯",
    light: TONE_TEXT.clean,
    energy: ENERGY_TEXT.calm,
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleMakeupDesk(slots: T2iSlots): PromptLayers {
  const who = groupWho(slots.groupType)
  const beat =
    slots.makeupStage === "bare"
      ? `一位${who}穿着连帽卫衣坐在镜前，妆前素颜清爽，造型师在旁边整理她的发丝`
      : slots.makeupStage === "wardrobe"
        ? `造型师和一位${who}站在衣架前一件件挑舞台服，手里比着两件亮片上衣`
        : `一位${who}定妆完成，穿好亮片长袖舞台服，造型师在做最后的碎发整理`
  return {
    subject: beat,
    scene: "妆造间里有一圈灯泡的化妆镜和摊满化妆品的台面，身后衣架挂满舞台服和外套",
    light: TONE_TEXT[slots.tone],
    energy: ENERGY_TEXT.calm,
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleBackstageWait(slots: T2iSlots): PromptLayers {
  return {
    subject: `${people(slots.groupType, slots.count)}穿着亮片长袖舞台服，戴耳机听歌、互相帮忙别耳麦、低声对站位`,
    scene: "开播前的侧幕通道，黑色遮光幕布配堆放的音箱和线材，远处漏进一道舞台光",
    light: "整体偏暗，主要靠远处漏进来的舞台光和手机屏幕补脸",
    energy: ENERGY_TEXT[slots.energy],
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleOffairLate(slots: T2iSlots): PromptLayers {
  const beat =
    slots.offairBeat === "snack"
      ? {
          subject: `${people(slots.groupType, slots.count)}妆还没卸，套着羽绒服围在一张小桌前吃夜宵，笑作一团`,
          scene: "凌晨的基地休息区，泡面碗和奶茶杯占满桌面，椅背上挂着舞台服",
        }
      : slots.offairBeat === "empty"
        ? {
            subject: `一位${groupWho(slots.groupType)}摘下耳麦，独自坐在舞台边缘看着空荡的直播间`,
            scene:
              "刚下播的直播间，大灯已关，只剩一盏工作灯和地面残余的反光，摄像机盖上了防尘罩",
          }
        : {
            subject: `${people(slots.groupType, slots.count)}下播后瘫坐在地板上，有人躺平盯着天花板，有人低头刷手机`,
            scene: "凌晨的直播间地面上散落着水瓶、脱下的短靴和卷成一团的线材",
          }
  return {
    subject: beat.subject,
    scene: beat.scene,
    light: "只有一盏工作灯和手机屏幕的光，画面暗部很多，颗粒感明显",
    energy: "疲惫但松弛，是一天结束后的真实状态",
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleBaseLife(slots: T2iSlots): PromptLayers {
  const scene =
    slots.baseScene === "dorm"
      ? {
          subject: `${people(slots.groupType, slots.count)}穿着家居服坐在宿舍公共休息区，一起刷手机聊天，有人盘腿坐在地毯上`,
          scene: "团播基地的宿舍公共区，布艺沙发配小茶几，墙上贴着排班表，干净年轻不豪华",
        }
      : {
          subject: `${people(slots.groupType, slots.count)}穿着短袖和运动裤，在食堂长桌边挨着坐吃饭，边吃边聊`,
          scene: "团播基地的食堂，不锈钢餐盘、长条木桌和明亮顶灯，干净整洁不豪华",
        }
  return {
    subject: scene.subject,
    scene: scene.scene,
    light: TONE_TEXT.clean,
    energy: "轻松日常，笑得自然，不是摆拍",
    camera: VIEWPOINT_TEXT.bystander,
  }
}

function assembleCrewCamera(slots: T2iSlots): PromptLayers {
  const role =
    slots.crewRole === "lighting"
      ? "前景是灯光师伸手在调桁架灯的角度"
      : slots.crewRole === "director"
        ? "前景是导播坐在一排监视器前，手放在切换台上"
        : slots.crewRole === "choreo"
          ? "前景是编舞老师抱着平板看排练，另一只手在打节拍"
          : "前景是运镜师的侧脸和手持稳定器，正压低身位跟拍"
  return {
    subject: `${role}，都是二十几岁的年轻工作人员，穿着黑色工作服`,
    scene: `背景是虚化的${groupWho(slots.groupType)}舞者和舞台灯光，设备真实、线材理得整齐`,
    light: TONE_TEXT.neon,
    energy: "专注的工作状态",
    camera: "浅景深，焦点在前景人物，背景舞台化成光斑",
  }
}

function assemblePosterBlank(slots: T2iSlots): PromptLayers {
  const look = THEME_LOOK[slots.theme]
  const filled = slots.blankSide === "bottom" ? "上三分之二" : "下三分之二"
  const empty = slots.blankSide === "bottom" ? "底部" : "顶部"
  return {
    subject: `五名${groupWho(slots.groupType)}穿着${look.dress}的群像占据画面${filled}，站成前后错落的队形`,
    scene: `${look.set}，${empty}三分之一刻意压暗留空，是一片可以叠字的纯净暗部`,
    light: look.light,
    energy: ENERGY_TEXT[slots.energy],
    money: MONEY_TEXT[slots.moneyCue],
    camera: "正面构图，畸变小，适合后期加标题",
  }
}

export const T2I_TEMPLATES: T2iTemplate[] = [
  {
    id: "live-onair",
    title: "直播中实况",
    blurb: "补光灯、竖屏、礼物飘屏",
    slots: ["groupType", "count", "viewpoint", "moneyCue", "energy", "tone"],
    assemble: assembleLiveOnair,
  },
  {
    id: "pk-battle",
    title: "PK 对战",
    blurb: "赢了起跳，落后催票",
    slots: ["groupType", "count", "pkBeat", "moneyCue"],
    assemble: assemblePkBattle,
  },
  {
    id: "stage-sync",
    title: "舞台齐舞",
    blurb: "晚会级直播舞台封面",
    slots: ["groupType", "theme", "count", "moneyCue", "energy"],
    assemble: assembleStageSync,
  },
  {
    id: "practice-room",
    title: "练舞室日常",
    blurb: "镜子、把杆、真实训练",
    slots: ["groupType", "count", "practiceStatus", "energy"],
    assemble: assemblePracticeRoom,
  },
  {
    id: "coach-hands-on",
    title: "老师手把手",
    blurb: "零基础也能跟上",
    slots: ["groupType", "newbieCount", "coachGender"],
    assemble: assembleCoachHandsOn,
  },
  {
    id: "makeup-desk",
    title: "妆造台",
    blurb: "服化道公司包",
    slots: ["groupType", "makeupStage", "tone"],
    assemble: assembleMakeupDesk,
  },
  {
    id: "backstage-wait",
    title: "开播前候场",
    blurb: "侧幕里的团气氛",
    slots: ["groupType", "count", "energy"],
    assemble: assembleBackstageWait,
  },
  {
    id: "offair-late",
    title: "下播凌晨",
    blurb: "瘫在地上、夜宵、空舞台",
    slots: ["groupType", "count", "offairBeat"],
    assemble: assembleOffairLate,
  },
  {
    id: "base-life",
    title: "基地生活",
    blurb: "食堂或宿舍日常",
    slots: ["baseScene", "count", "groupType"],
    assemble: assembleBaseLife,
  },
  {
    id: "crew-camera",
    title: "幕后机位",
    blurb: "运镜、灯光、导播、编舞",
    slots: ["crewRole", "groupType"],
    assemble: assembleCrewCamera,
  },
  {
    id: "poster-blank",
    title: "海报底图",
    blurb: "留空给加文字",
    slots: ["groupType", "theme", "blankSide", "moneyCue", "energy"],
    assemble: assemblePosterBlank,
  },
]

export const DEFAULT_T2I_TEMPLATE_ID: T2iTemplateId = "live-onair"

export const DEFAULT_T2I_SLOTS: T2iSlots = {
  groupType: "girl",
  theme: "pop",
  count: "5",
  energy: "high",
  tone: "neon",
  moneyCue: "gift",
  viewpoint: "phone",
  pkBeat: "win",
  offairBeat: "collapse",
  practiceStatus: "learn",
  newbieCount: "3",
  coachGender: "female",
  makeupStage: "done",
  baseScene: "canteen",
  crewRole: "camera",
  blankSide: "bottom",
}

export function getT2iTemplate(id: T2iTemplateId): T2iTemplate {
  return T2I_TEMPLATES.find((template) => template.id === id) ?? T2I_TEMPLATES[0]!
}

export function buildT2iPrompt(id: T2iTemplateId, slots: T2iSlots): string {
  const layers = getT2iTemplate(id).assemble(slots)
  const resolved: Record<string, string | undefined> = {
    ...layers,
    spec: SPEC_LAYER,
    exclude: EXCLUDE_LAYER,
  }

  return LAYER_ORDER.map(({ label, key }) => ({ label, text: tidy(resolved[key]) }))
    .filter(({ text }) => text.length > 0)
    .map(({ label, text }) => `${label}：${text}。`)
    .join("\n")
}

function tidy(value?: string): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/。$/, "").trim()
}

export const T2I_DEFAULT_PROMPT = buildT2iPrompt(DEFAULT_T2I_TEMPLATE_ID, DEFAULT_T2I_SLOTS)

export function randomT2iPreset(excludeId?: T2iTemplateId): {
  id: T2iTemplateId
  slots: T2iSlots
} {
  const pool = T2I_TEMPLATES.filter((template) => template.id !== excludeId)
  const list = pool.length > 0 ? pool : T2I_TEMPLATES
  const template = list[Math.floor(Math.random() * list.length)] ?? T2I_TEMPLATES[0]!
  const slots: T2iSlots = { ...DEFAULT_T2I_SLOTS }

  for (const key of template.slots) {
    const options = SLOT_DEFS[key].options
    const option = options[Math.floor(Math.random() * options.length)]
    if (!option) continue
    Object.assign(slots, { [key]: option.value })
  }

  return { id: template.id, slots }
}
