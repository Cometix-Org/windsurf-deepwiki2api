## Windsurf Deepwiki
### 登录
~~首先在登录状态下访问 https://windsurf.com/editor/signin?response_type=token&redirect_uri=windsurf%3A%2F%2Fcodeium.windsurf&prompt=login&redirect_parameters_type=fragment&workflow=onboarding
会有一个打开Windsurf的状态，取消掉，然后页面上有一个Manual Auth，有一串token。~~
~~命令面板——Context Code Text: Windsurf Login 然后这里输入这个token，等待片刻即可。~~

目前版本直接 命令面板——Context Code Text: Windsurf Login 打开链接输入 token 即可，理论上加油猴脚本可以做自动登录

### 使用
点击某个你希望预览的符号，然后命令面板里Context Code Text: Show Deepwiki，右边会开始加载然后显示

或者右键 Context Code Text: Show Deepwiki

不要太急了，等 LSP 加载好再问