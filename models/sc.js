const request = require('request');
const fs = require('fs');
const path = require('path');
const config = require('config');
const spawn = require('child_process').spawn;

// Config Settings
const credentials = {
                    form:{
                        obj:'{login:"'+config.get('credentials.login')+'",'+
                             'pword:"'+config.get('credentials.password')+'"}'
                    }
                };
const uspsLinks = config.get('usps-links');
const localCert = config.get('certificates.local');
const unzipPassword = config.get('credentials.unzip');

//Directories 
const certificatesDir = path.normalize('./certificates');
const downloadDir = path.normalize('./kettle-jobs/files/downloads');
const unzipDir = path.normalize('./kettle-jobs/files/unzipped');
const sevenExe = path.normalize('./vendors/7-Zip/7z.exe');


//Website Token Key
let tokenkey = null;
let logonkey = null;
let fileIds = {};
let items = -1;


/*
 * Start the connection, download and extraction
 */
module.exports = {
    
    initialize: () => {
        
        console.log('Booting Up'); 
        request.get(
            setHeaders(uspsLinks.checkVersion,{ timeout: 5000}),
            (e,l,data)=>{
                 if(e === null && data.response== 'success'){            
                    console.log('Checking USPS connection... ' + data.response);
                    login();
                }else {
                    if(data != undefined)
                    {
                        console.error('Failed Connecting to the USPS Website:' + data.response);            
                    }
                    else
                    {
                        console.error(request);
                        console.error(e);      
                        console.error(l);          
                    }
                    
                }});    
        }
};


/*
 * Sets the URLS for the request
 */
function setHeaders(urlRequest, more){
    let headers = {
        url: urlRequest,
        agentOptions: {
            ca: fs.readFileSync(path.join(certificatesDir,localCert))
        },
        json:true
    };
    return Object.assign(headers,more);    
};

/*
 * Login
 */
function login(){
        console.log('Logging In. . .');
        request.post(uspsLinks.login,
                     setHeaders(uspsLinks.login,credentials),
        (e,l,data)=>{
            if(e === null && data.response== 'success'){                
                console.log(data.messages);
                logonkey = data.logonkey;
                tokenkey = data.tokenkey; 
                if(listFiles()){
                    unzipArchives();
                }
            } else {                
                console.error(e);                        
                console.error(data);
                return false;
            }
        });
};

/*
 * Get Download Lists
 */
function listFiles(){
console.log('Getting File List . . .');
    var posted = false;
    request.post(
        uspsLinks.listFiles,
        setHeaders(uspsLinks.listFiles,{form:{obj:'{logonkey:"'+logonkey+'",tokenkey:"'+tokenkey+'"}'}}),
        (e,l,data)=>{
            if(e === null && data.response== 'success'){                                    
                console.log(data.messages);
                posted = true;
                logonkey = data.logonkey;
                tokenkey = data.tokenkey; 
                if (data.dnldfileList != undefined){
                items += data.dnldfileList.length;            
                    if(items != -1){
                    console.log('Downloading Files'); 
                    download(data.dnldfileList);
                    }
                } else{
                    console.log('No New Files'); 
                    logout();
                    posted = false;
                }                
                
            } else {
                console.error(data);
                posted = false;
            }
        }).on('response',(response)=>{
        return posted;
    });
};

/*
 * Download and write to file
 */
function download(fileData){
    if(items >= 0){
        if(fileData[items].status == 'N'){
        request.post(
            uspsLinks.download,
            {   url: uspsLinks.download,
                agentOptions: {
                    ca: fs.readFileSync(path.join(certificatesDir,localCert))
                },
             form:{obj:'{logonkey:"'+logonkey+'",tokenkey:"'+tokenkey+'",fileid:"'+fileData[items].fileid+'"}'}})
            .on('error',(error)=>{
            console.error('Failed to Download');
            console.error(error);
            })
            .on('response',(response)=>{
                logonkey = response.headers['user-logonkey'];
                tokenkey = response.headers['user-tokenkey'];                
                status(fileData);
            })
            .pipe(fs.createWriteStream( path.join(downloadDir , fileData[items].filename)))     
        }else{
            --items;
            download(fileData);
        }
    }else{
        unzipArchives();
    }
};


/*
 * Updated Status of file.
 */
function status(fileData){
    request.post(
            uspsLinks.status,
            {   url: uspsLinks.status,
                agentOptions: {
                    ca: fs.readFileSync(path.join(certificatesDir,localCert))
                },
             form:{obj:'{logonkey:"'+logonkey+'",tokenkey:"'+tokenkey+'"newstatus:"C",fileid:"'+fileData[items].fileid+'"}'}})
            .on('error',(error)=>{
            console.error('Failed to Download');
            console.error(error);
            --items;
            download(fileData);
            })
            .on('response',(response)=>{
                logonkey = response.headers['user-logonkey'];
                tokenkey = response.headers['user-tokenkey'];
                console.log('Downloaded:' +fileData[items].filename);
                --items;
                download(fileData);
            });
}

/*
 * Unzip Archives
 */
function unzipArchives(){

    console.log('Unzipping Files. . .');

    fs.readdirAsync = function(dirName) {
        return new Promise(function (resolve, reject){
            fs.readdir(dirName, function(err, fileName){                
                if(err)
                {
                    reject(err);
                }
                else
                {
                    resolve(fileName);
                }

            });
        });
    };

    fs.readdirAsync(downloadDir).then((files)=>{
       return Promise.all(files.map((file)=>{
                return path.join(downloadDir,file);
            }).filter((file)=>{
                return fs.statSync(file).isFile();        
            }));
      }).then((files)=>{
        files.forEach((fileTwo)=>{
                if (process.platform != 'win32')
                {
                     spawn('unzip', ['-P',unzipPassword,'-d',unzipDir,fileTwo])
                         .on('response',(response)=>{
                            console.log('Unzipped: '+fileTwo);})
                         .on('error',(err)=>{
                              console.error(err);
                            });
                }
                else
                {
                    spawn(sevenExe, ['x',
                                     '-p"'+unzipPassword+'"',
                                     '-y',
                                     '-o"'+path.resolve(unzipDir).replace(/\\/g,'\\\\')+'"',
                                     '"'+ (path.resolve('./')+path.sep+path.sep+fileTwo).replace(/\\/g,'\\\\')+'"'],
                                    {shell:true});
                     
                    console.log('Unzipped: '+ fileTwo);
                }
            });
        }).then(function (){
            logout();
        }).catch(function(err){

            console.log(err);

        });
    }

/*
 * Logout
 */
function logout(){
    console.log('Logging Out. . .');
    request.post(
        uspsLinks.listFiles,
        setHeaders(uspsLinks.listFiles,{form:{obj:'{logonkey:"'+logonkey+'",tokenkey:"'+tokenkey+'"}'}}),
        (e,l,data)=>{
           if(e === null && data.response== 'success'){                                
                console.log('Finished');
            } else {
                console.log(data.message);
            }
        });
};