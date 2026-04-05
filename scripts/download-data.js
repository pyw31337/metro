import fs from "fs";
import https from "https";
import path from "path";

const downloads = [
  {
    url: "https://data.gg.go.kr/portal/data/sheet/downloadSheetData.do?rows=100000&infId=6KBYRR0MU2RPORDO33W834395723&infSeq=1&downloadType=J&loc=",
    dest: "downloads/gyeonggi-bus-paths.json",
  },
  {
    url: "https://www.incheon.go.kr/comm/getFile?srvcId=BBSTY1&upperNo=3065202&fileTy=ATTACH&fileNo=2",
    dest: "downloads/incheon-bus-routes.xlsx",
  },
  {
    url: "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002621946&fileDetailSn=0",
    dest: "downloads/seoul-bus-paths.zip",
  },
];

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    console.log(`Starting download from ${url} to ${dest}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        console.log(`Finished download: ${dest}`);
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

async function main() {
  if (!fs.existsSync("downloads")) fs.mkdirSync("downloads");
  for (const item of downloads) {
    try {
      await downloadFile(item.url, item.dest);
    } catch (err) {
      console.error(`Error downloading ${item.dest}: ${err.message}`);
    }
  }
}

main();
