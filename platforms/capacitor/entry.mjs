import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { platform } from './platform.mjs';
import { installNativePlatform } from './native-platform.mjs';

if(Capacitor.isNativePlatform()) {
  installNativePlatform(platform,{App,Files:registerPlugin('CircuitFiles'),Filesystem,Share,Directory,Encoding},message=>{
    const toast=document.getElementById('toast');if(toast){toast.textContent=message;toast.hidden=false;}
  });
} else platform.prepareOffline=async()=>{};
await import('./app.js');
