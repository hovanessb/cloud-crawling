# Description
This is a Node JS Script that connected to the USPS API and downloads
current NCOA updates from FSO mailings.

Nodejs was used here as it was much easier to handle USPS API in a scripted fashion.
Kettle was used as a final handling for the files as it was much simpler to handle 
the SQL logic and API calls to handle the mail returns, then to program it in Nodejs.

# Logic
Currently the  sequence of actions goes as follows:

1. The server logs on with credentials for the USPS website
2. It checks for new files, and downloads the Zips into a directory.
3. After the download finishes, it extracts the Zip file contents with an exact password
4. After the contents have all been extracted. It should take less then 30 seconds.
5. A seperate Kettle job will run, read .csv files from USPS, import address updates and then log invalid address to a specific mail return API.
6. Kettle deletes the .csv's once its done working

# Running the Script
The script can be started by running:

    `node init`
        
# Unzipping the Files
I am currently using 7zip to unzip the files with a password but have added
logic to the Node script to use the unzip library for use in a linux environment,
I have not tested this out but in theory should be quite flexible.