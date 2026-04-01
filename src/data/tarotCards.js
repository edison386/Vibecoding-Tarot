const TAROT_CARDS = [
  {
    id: 1,
    name: '愚者',
    keywords: ['启程', '冒险', '未知'],
    uprightMeaning: '你正站在新旅程的起点，勇气比完美计划更重要。',
    reversedMeaning: '冲动或逃避现实会让你错过关键细节，先停一下再行动。'
  },
  {
    id: 2,
    name: '魔术师',
    keywords: ['行动', '掌控', '创造'],
    uprightMeaning: '资源已经在你手里，关键是把想法转化为具体动作。',
    reversedMeaning: '能力分散或过度包装会削弱结果，需要回到核心目标。'
  },
  {
    id: 3,
    name: '女祭司',
    keywords: ['直觉', '内在', '观察'],
    uprightMeaning: '保持观察，你的直觉已经给出正确方向。',
    reversedMeaning: '信息尚未完整，过早决策会放大误判。'
  },
  {
    id: 4,
    name: '皇后',
    keywords: ['滋养', '丰盛', '成长'],
    uprightMeaning: '稳定投入会换来可见成长，特别适合长期建设。',
    reversedMeaning: '过度照顾他人可能让你忽视自己的边界。'
  },
  {
    id: 5,
    name: '皇帝',
    keywords: ['秩序', '规则', '责任'],
    uprightMeaning: '建立结构和规则，你会更快看到可控成果。',
    reversedMeaning: '过度控制可能引发对抗，适当留白更有效。'
  },
  {
    id: 6,
    name: '教皇',
    keywords: ['传统', '学习', '指导'],
    uprightMeaning: '向成熟方法学习，你会少走弯路。',
    reversedMeaning: '照搬旧经验可能不适配当前情境，需要灵活调整。'
  },
  {
    id: 7,
    name: '恋人',
    keywords: ['关系', '选择', '价值'],
    uprightMeaning: '核心课题是价值一致性，选择会影响长期走向。',
    reversedMeaning: '犹豫和外部干扰让你偏离内心真正想要的。'
  },
  {
    id: 8,
    name: '战车',
    keywords: ['推进', '意志', '突破'],
    uprightMeaning: '聚焦一个方向并持续推进，你会打破停滞。',
    reversedMeaning: '节奏失控或目标分裂，会让努力被相互抵消。'
  },
  {
    id: 9,
    name: '力量',
    keywords: ['韧性', '耐心', '温和'],
    uprightMeaning: '温和但坚定的方式，比硬碰硬更能赢得结果。',
    reversedMeaning: '情绪波动会削弱判断，先稳住自己再处理问题。'
  },
  {
    id: 10,
    name: '隐者',
    keywords: ['沉淀', '独处', '复盘'],
    uprightMeaning: '给自己留出独立思考空间，答案会更清晰。',
    reversedMeaning: '过度封闭会错过外部帮助，适度沟通很重要。'
  },
  {
    id: 11,
    name: '命运之轮',
    keywords: ['变化', '周期', '机会'],
    uprightMeaning: '局势正在转动，抓住窗口期比等待完美更关键。',
    reversedMeaning: '外部变化超出预期，先提高应变能力再扩张。'
  },
  {
    id: 12,
    name: '正义',
    keywords: ['平衡', '因果', '决断'],
    uprightMeaning: '客观评估得失后再决策，会让后续执行更顺。',
    reversedMeaning: '偏见或信息失衡可能导致判断失真。'
  },
  {
    id: 13,
    name: '倒吊人',
    keywords: ['暂停', '转视角', '等待'],
    uprightMeaning: '暂缓推进并换一个视角，能看见之前忽略的解法。',
    reversedMeaning: '拖延或僵持会让成本继续累积。'
  },
  {
    id: 14,
    name: '死神',
    keywords: ['结束', '蜕变', '重启'],
    uprightMeaning: '阶段性结束是必要清理，为新机会腾出空间。',
    reversedMeaning: '抗拒改变会拉长阵痛期。'
  },
  {
    id: 15,
    name: '节制',
    keywords: ['协调', '整合', '节奏'],
    uprightMeaning: '通过平衡节奏与资源，你会持续稳定前进。',
    reversedMeaning: '极端做法让系统失衡，先回到中间地带。'
  },
  {
    id: 16,
    name: '恶魔',
    keywords: ['束缚', '诱惑', '执念'],
    uprightMeaning: '识别你当前最强的依赖和恐惧，是破局第一步。',
    reversedMeaning: '你已开始松动旧束缚，保持清醒即可脱困。'
  },
  {
    id: 17,
    name: '高塔',
    keywords: ['冲击', '真相', '重建'],
    uprightMeaning: '短期冲击会揭露问题根源，重建反而更稳。',
    reversedMeaning: '回避现实只会延后且放大冲突。'
  },
  {
    id: 18,
    name: '星星',
    keywords: ['希望', '疗愈', '愿景'],
    uprightMeaning: '保持长期愿景，你会在波动中看到恢复迹象。',
    reversedMeaning: '信心不足会削弱执行力度，需要小步重建信任。'
  },
  {
    id: 19,
    name: '月亮',
    keywords: ['潜意识', '迷雾', '情绪'],
    uprightMeaning: '当前信息有雾，先澄清事实再做承诺。',
    reversedMeaning: '迷雾正在散去，你将逐步看清关键点。'
  },
  {
    id: 20,
    name: '太阳',
    keywords: ['清晰', '成功', '活力'],
    uprightMeaning: '正向能量强，主动表达将为你带来支持。',
    reversedMeaning: '过度乐观可能忽略执行细节，需要补齐落地步骤。'
  },
  {
    id: 21,
    name: '审判',
    keywords: ['觉醒', '召唤', '复盘'],
    uprightMeaning: '现在适合做关键决定，回应内在召唤。',
    reversedMeaning: '迟迟不决会让机会窗口逐渐关闭。'
  },
  {
    id: 22,
    name: '世界',
    keywords: ['完成', '整合', '阶段收官'],
    uprightMeaning: '一个周期接近完成，适合总结并进入下一阶段。',
    reversedMeaning: '收尾不彻底会影响下一轮起步质量。'
  }
];

module.exports = {
  TAROT_CARDS
};
