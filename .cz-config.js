module.exports = {
  types: [
    { value: 'feat', name: 'feat:     ✨  新功能' },
    { value: 'fix', name: 'fix:      🐛  修复 Bug' },
    { value: 'docs', name: 'docs:     📝  文档变更' },
    { value: 'style', name: 'style:    💄  代码格式(不影响代码运行的变动)' },
    { value: 'refactor', name: 'refactor: ♻️   代码重构(既不是新增功能，也不是修改bug)' },
    { value: 'perf', name: 'perf:     ⚡️  性能优化' },
    { value: 'test', name: 'test:     ✅  增加测试' },
    { value: 'chore', name: 'chore:    🔨  构建过程或辅助工具的变动' },
    { value: 'revert', name: 'revert:   ⏪  回滚' },
    { value: 'build', name: 'build:    📦  打包' }
  ],
  scopes: [
    { name: 'ui' },
    { name: 'logic' },
    { name: 'service' },
    { name: 'config' },
    { name: 'deps' },
    { name: 'other' }
  ],
  messages: {
    type: '确保本次提交遵循 Angular 规范！\n选择你要提交的类型：',
    scope: '\n选择一个 scope (可选):',
    customScope: '请输入自定义的 scope:',
    subject: '填写精简简短的修改描述:\n',
    body: '填写详细的修改描述 (可选)。使用 "|" 换行:\n',
    breaking: '列出非兼容性重大的变更 (可选):\n',
    footer: '列出本次上传修复的 issues (可选)。 E.g.: #31, #34:\n',
    confirmCommit: '确认提交？'
  },
  allowCustomScopes: true,
  allowBreakingChanges: ['feat', 'fix'],
  subjectLimit: 100
};
