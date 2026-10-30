import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

// Callers serialize writes and hold their state directory's single-instance pipe.
export async function saveStateJson(file,record) {
  const pending=`${file}.tmp`,json=JSON.stringify(record,null,2);
  try {
    for(let attempt=0;;attempt++) {
      try {await fs.writeFile(pending,json,'utf8');await fs.rename(pending,file);return;}
      catch(error) {
        // Windows readers/scanners can briefly deny replacement of an open file.
        if(!['EBUSY','EPERM','EACCES'].includes(error.code)||attempt>=19)throw error;
        await delay(100);
      }
    }
  } finally {await fs.rm(pending,{force:true}).catch(()=>{});}
}
