import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import { registerFCMWidgetHandlers } from './src/widgets/fcmWidgetSync';
import App from './App';

registerFCMWidgetHandlers();
registerRootComponent(App);
