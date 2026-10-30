import { useEffect,useState } from 'react';
import { api } from '../../services/api.js';
export default function PrivateAssetImage({asset,alt,className}){
  const [url,setUrl]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{let objectUrl;const controller=new AbortController();setUrl('');setFailed(false);
    api.get(`/creator/media/${asset.id}`,{responseType:'blob',signal:controller.signal}).then(result=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(result.data);setUrl(objectUrl);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[asset.id,asset.revision]);
  return url?<img src={url} alt={alt} className={className}/>:<span className="brand-helper">{failed?'Preview unavailable':'Loading image…'}</span>;
}
