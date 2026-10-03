/** Точка входа клиентских скриптов: модули регистрируются, затем запускается жизненный цикл */
import './menu.ts';
import './header.ts';
import './reveal.ts';
import './orbits.ts';
import './accordion.ts';
import './form.ts';
import './filters.ts';
import './copy.ts';
import './cookie.ts';
import { start } from './lifecycle.ts';

start();
