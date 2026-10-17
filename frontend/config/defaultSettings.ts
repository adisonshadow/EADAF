import { ProLayoutProps } from '@ant-design/pro-components';

/**
 * @name 默认配置
 */
const Settings: ProLayoutProps & {
  pwa?: boolean;
  logo?: string;
} = {
  navTheme: 'light', // 主题颜色， light浅白色，realDark深色
  title: 'EADAF', // 系统名称
  logo: '/images/EADAF-logo.png', // 系统logo地址（放在public目录下）
  colorPrimary: '#0476e7', // 拂晓蓝

  // 如无必要，尽量不要配置下面
  siderWidth: 208, // 侧边菜单宽度
  pure: false, // 是否删除掉所有的自带界面
  layout: 'top', // layout 的菜单模式，side：右侧导航，top：顶部导航， 可选：side | top | mix
  contentWidth: 'Fluid', // layout 的内容模式，Fluid：自适应，Fixed：定宽 1200px
  fixedHeader: true,  // 是否固定 header 到顶部
  fixSiderbar: true, // 是否固定导航
  colorWeak: false,
  pwa: true, // 是否开启 pwa，pwa是 Progressive Web App 的缩写，即渐进式 Web 应用
  iconfontUrl: '',
  token: {
    // 参见ts声明，demo 见文档，通过token 修改样式
    //https://procomponents.ant.design/components/layout#%E9%80%9A%E8%BF%87-token-%E4%BF%AE%E6%94%B9%E6%A0%B7%E5%BC%8F
    
  },
  menu: {
    // 默认是 false，当设置为 true 时，会根据 name 生成对应的路由路径
    // https://umijs.org/docs/max/menu#%E5%88%9B%E5%BB%BA%E8%B7%AF%E7%94%B1%E8%B7%AF%E5%BE%84
    locale: false,
    
  },
  // menuProps: {
  //   theme: 'dark',
  // },
  // waterMarkProps: {
  //   content: 'MoM Client',
  //   fontSize: 12,
  //   fontColor: '#dfdfdf',
  //   fontWeight: 400,
  //   rotate: -20,
  //   width: 120,
  //   height: 120,
  //   zIndex: 100,
  //   gapX: 100,
  //   gapY: 100,
  // }
};

export default Settings;
