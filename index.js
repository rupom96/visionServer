
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
//qr
const Jimp = require("jimp");
const qrCode = require('qrcode-reader');

const { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } = require('@zxing/library');
const jpeg = require('jpeg-js');
const { MongoClient, ServerApiVersion } = require('mongodb');

const javascriptBarcodeReader = require('javascript-barcode-reader');
const Quagga = require('quagga').default;

var fs = require('fs');
const imageToBase64 = require('image-to-base64');
var path = require('path');
const { Storage } = require('@google-cloud/storage');
var stream = require('stream');
require('dotenv').config();

const app = express();


app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb' }));
// app.use(express.bodyParser({ limit: '50mb' }));
// app.use(bodyParser.json({ limit: '100mb' }));
// app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
const port = process.env.PORT || 6600;




// Imports the Google Cloud client library.
const vision = require('@google-cloud/vision');
const CREDENTIALS = JSON.parse(process.env.VISION_AI_SERVICE);

const CONFIG = {
    credentials: {
        private_key: CREDENTIALS.private_key,
        client_email: CREDENTIALS.client_email
    }
};

const client = new vision.ImageAnnotatorClient(CONFIG);

const productClient = new vision.ProductSearchClient(CONFIG);

const gcs = new Storage({
    // keyFilename: path.join(__dirname, "/deft-striker-serviceMailKey.json"),
    // keyFilename: process.env.VISION_AI_SERVICE,
    credentials: {
        private_key: CREDENTIALS.private_key,
        client_email: CREDENTIALS.client_email
    },
    project_id: CREDENTIALS.project_id
});

// gcs.getBuckets().then(x => console.log(x));




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gxrbr.mongodb.net/?retryWrites=true&w=majority`;
const mongoclient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// mongoclient.connect(err => {
//     const collection = mongoclient.db("test").collection("devices");
//     // perform actions on the collection object
//     console.log("hitting the mongodb");
//     mongoclient.close();
// });




//create product set.............................
async function createProductSet() {
    /**
     * TODO(developer): Uncomment the following line before running the sample.
     */
    const projectId = CREDENTIALS.project_id;
    const location = `${process.env.VISION_LOCATION}`;
    const productSetId = `${process.env.PROD_SET_ID}`;
    const productSetDisplayName = 'databizonline_prodset';

    // Resource path that represents Google Cloud Platform location.
    const locationPath = productClient.locationPath(projectId, location);

    const productSet = {
        displayName: productSetDisplayName,
    };

    const request = {
        parent: locationPath,
        productSet: productSet,
        productSetId: productSetId,
    };

    const [createdProductSet] = await productClient.createProductSet(request);
    console.log(`Product Set name: ${createdProductSet.name}`);
}
// createProductSet();




//mongoDb functions
async function run() {
    try {
        await mongoclient.connect();

        console.log('db connected');

        const database = mongoclient.db("DataBiz");
        const tokensCollection = database.collection('tokens');


        //GET all tokens API
        // app.get('/tokens', async (req, res) => {
        //     const cursor = tokensCollection.find({});
        //     const tokens = await cursor.toArray();
        //     res.send(tokens);
        // });
        //GET single token API
        app.post('/tokens', async (req, res) => {
            const tokennum = req.body.tokennum;
            // const id = 123456;
            console.log('getting specific token', tokennum);
            const query = { token: tokennum };
            const single = await tokensCollection.findOne(query);
            res.json(single);
        })

        //insert single token API
        app.post('/tokensInsert', async (req, res) => {
            const tokennum = req.body.tokennum;
            const flag = req.body.flag;
            // const token = req.body;
            const token = { token: tokennum, flag: flag }
            console.log('hit the post api', token);

            const result = await tokensCollection.insertOne(token);
            console.log(result);
            res.json(result);
        });

        //delete single bike/product
        app.post('/tokensDlt', async (req, res) => {
            const tokennum = req.body.tokennum;
            const query = { token: tokennum };
            const result = await tokensCollection.deleteOne(query);
            console.log('deleting product with id', result);
            res.json(result);
        });


        //update flag value of a single token
        app.post('/tokensUpdate', async (req, res) => {
            const tokennum = req.body.tokennum;
            const flag = req.body.flag;
            console.log('updating tokenFLag', tokennum)
            const query = { token: tokennum };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    flag: flag
                },
            };
            const result = await tokensCollection.updateOne(query, updateDoc, options);
            console.log('flag set to true', result);

            res.json(result);
        });

    }
    finally {
        // await mongoclient.close();
    }
}
// run().catch(console.dir);





//--------------Listing all products in a product set----------------
async function listProductsInProductSet() {
    /**
     * TODO(developer): Uncomment the following line before running the sample.
     */
    const projectId = CREDENTIALS.project_id;
    const location = `${process.env.VISION_LOCATION}`;
    const productSetId = `${process.env.PROD_SET_ID}`;
    const productSetPath = productClient.productSetPath(
        projectId,
        location,
        productSetId
    );
    const getAllListReq = {
        name: productSetPath,
    };
    var allProdList = [];
    const [products] = await productClient.listProductsInProductSet(getAllListReq);
    products.forEach(product => {

        const singleProdDetails = {
            Pname: product.displayName,
            Pid: product.name.split('/').pop(-1)
        };
        allProdList.push(singleProdDetails);

    });
    console.log(allProdList);
}
// listProductsInProductSet();


//------------Listing reference images----------------
async function listReferenceImage() {
    /**
     * TODO(developer): Uncomment the following line before running the sample.
     */
    const projectId = CREDENTIALS.project_id;
    const location = `${process.env.VISION_LOCATION}`;
    const productId = '283299';
    const formattedParent = productClient.productPath(projectId, location, productId);
    const request = {
        parent: formattedParent,
    };
    //https://storage.cloud.google.com/${process.env.BUCKET_NAME}/bottle21.JPEG
    var imgsOfProd = [];
    const [response] = await productClient.listReferenceImages(request);
    response.forEach(image => {
        var perImg = {
            imgName: image.name.split('/').pop(-1),
            imgURL: `https://storage.cloud.google.com/${process.env.BUCKET_NAME}/${image.uri.split('/').pop(-1)}`
        };
        imgsOfProd.push(perImg);
    });
    console.log(imgsOfProd);
}
// listReferenceImage();

//YOU ALSO NEED TO DELETE THAT IMAGE FROM BUCKET............!!!!!!!!!!!! IMAGE DELETE AAR PRODUCT THEKE REF IMG DELETE ER CODE EK FUNCTION ER MODDHE HOBE!!!



//------------Delete a Reference Image from training set and bucket--------------
async function deleteReferenceImage() {
    /**
     * TODO(developer): Uncomment the following line before running the sample.
     */
    const projectId = CREDENTIALS.project_id;
    const location = `${process.env.VISION_LOCATION}`;
    const productId = '0';
    const referenceImageId = '0_1';
    const fileName = `${referenceImageId}.jpg`;

    const bucketName = `${process.env.BUCKET_NAME}`;

    const formattedName = productClient.referenceImagePath(
        projectId,
        location,
        productId,
        referenceImageId
    );

    const request = {
        name: formattedName,
    };

    await productClient.deleteReferenceImage(request);
    console.log('Reference image deleted from product.');
    //DELETING THAT IMAGE FROM BUCKET
    await gcs.bucket(bucketName).file(fileName).delete();
    console.log(`gs://${bucketName}/${fileName} deleted`);

}
// deleteReferenceImage();









//-----------------------Deleting a product---------------------------
async function deleteProduct() {
    /**
     * TODO(developer): Uncomment the following line before running the sample.
     */
    const projectId = CREDENTIALS.project_id;
    const location = `${process.env.VISION_LOCATION}`;
    const productId = '283299';

    // Resource path that represents full path to the product.
    const productPath = productClient.productPath(projectId, location, productId);

    await productClient.deleteProduct({ name: productPath });
    console.log('Product deleted.');
}
// deleteProduct();


//deleting a file from source project
var filePathTemp = 'tempPic1.jpg';
// fs.unlinkSync(filePathTemp);







app.get('/', (req, res) => {
    res.send('Hello World node js.. atlast rupom yo yo!');
});

app.get('/vision', (req, res) => {

    const img_path = req.query.path;

    if (img_path) {
        const detailsOfImg = async (path_img) => {
            const request = {
                // image: {
                //     content: path_img
                // },
                image: {
                    source: {
                        filename: path_img,
                        // imageUri: path_img,
                    },
                },
                features: [
                    {
                        maxResults: 01,
                        type: "LANDMARK_DETECTION"
                    },
                    {
                        maxResults: 10,
                        type: "OBJECT_LOCALIZATION"
                    },
                    {
                        maxResults: 01,
                        type: "TEXT_DETECTION"
                    },
                    {
                        maxResults: 01,
                        type: "LOGO_DETECTION"
                    },
                    {
                        maxResults: 01,
                        type: "LABEL_DETECTION"
                    },
                    {
                        maxResults: 03,
                        type: "FACE_DETECTION"
                    },
                ]
            };

            const [resultNew] = await client.annotateImage(request);
            console.log(resultNew);

            const imgDetails = [
                {
                    object: resultNew?.localizedObjectAnnotations[0]?.name,
                    text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                    brand: resultNew?.logoAnnotations[0]?.description,
                    landName: resultNew?.landmarkAnnotations[0]?.description
                }
            ]
            console.log(imgDetails);
            res.send(imgDetails);
        }
        detailsOfImg(img_path);
    }
    else {
        res.send("vision");
    }
});


app.post('/vision', (req, res) => {

    const img_path = req.body.pic;
    console.log("dhukse");
    const detailsOfImg = async (path_img) => {
        const request = {
            image: {
                content: path_img
            },
            // image: {
            //     source: {
            //         // filename: path_img,
            //         imageUri: path_img,
            //     },
            // },
            features: [
                {
                    maxResults: 01,
                    type: "LANDMARK_DETECTION"
                },
                {
                    maxResults: 01,
                    type: "OBJECT_LOCALIZATION"
                },
                {
                    maxResults: 01,
                    type: "TEXT_DETECTION"
                },
                {
                    maxResults: 01,
                    type: "LOGO_DETECTION"
                },
                {
                    maxResults: 01,
                    type: "LABEL_DETECTION"
                },
                {
                    maxResults: 03,
                    type: "FACE_DETECTION"
                },
            ]
        };

        const [resultNew] = await client.annotateImage(request);
        console.log(resultNew);


        //qr reader........................
        if (resultNew?.localizedObjectAnnotations[0]?.name == '2D barcode') {

            // //Zxing lib for qr code
            // const buffer = Buffer.from(path_img, "base64");
            // fs.writeFileSync("qrtemp.jpg", buffer);
            // var filePath = 'qrtemp.jpg';

            // // // library for bar code reader named ZXING(same code diye qr code o read hoy lol)
            // try {
            //     const jpegData = fs.readFileSync('qrtemp.jpg');
            //     const rawImageData = jpeg.decode(jpegData);

            //     const hints = new Map();
            //     const formats = [BarcodeFormat.QR_CODE];

            //     hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
            //     hints.set(DecodeHintType.TRY_HARDER, true);

            //     const reader = new MultiFormatReader();

            //     reader.setHints(hints);

            //     const len = rawImageData.width * rawImageData.height;

            //     const luminancesUint8Array = new Uint8Array(len);

            //     for (let i = 0; i < len; i++) {
            //         luminancesUint8Array[i] = ((rawImageData.data[i * 4] + rawImageData.data[i * 4 + 1] * 2 + rawImageData.data[i * 4 + 2]) / 4) & 0xFF;
            //     }

            //     const luminanceSource = new RGBLuminanceSource(luminancesUint8Array, rawImageData.width, rawImageData.height);

            //     // console.log(luminanceSource);

            //     const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

            //     const decoded = reader.decode(binaryBitmap);

            //     console.log(decoded.text);

            //     const imgDetails = [
            //         {
            //             object: resultNew?.localizedObjectAnnotations[0]?.name,
            //             text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
            //             brand: resultNew?.logoAnnotations[0]?.description,
            //             landName: resultNew?.landmarkAnnotations[0]?.description,
            //             qrcode: decoded.text
            //         }
            //     ]
            //     console.log(imgDetails);
            //     res.send(imgDetails);

            // }
            // catch (err) {
            //     const imgDetails = [
            //         {
            //             object: resultNew?.localizedObjectAnnotations[0]?.name,
            //             text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
            //             brand: resultNew?.logoAnnotations[0]?.description,
            //             landName: resultNew?.landmarkAnnotations[0]?.description,
            //             qrcode: err
            //         }
            //     ]
            //     console.log(imgDetails);
            //     res.send(imgDetails);
            // }

            // jimp lib for qr code

            const buffer = Buffer.from(path_img, "base64");
            fs.writeFileSync("qrtemp.jpg", buffer);
            var filePath = 'qrtemp.jpg';
            try {
                const img = await Jimp.read(fs.readFileSync(filePath));
                // console.log("see here rupom, oder buffer")
                // console.log(img);
                const qr = new qrCode();
                const value = await new Promise((resolve, reject) => {
                    qr.callback = (err, v) => err != null ? reject(err) : resolve(v);
                    qr.decode(img.bitmap);
                });
                // return value.result;
                // resQr = value.result;
                const imgDetails = [
                    {
                        object: resultNew?.localizedObjectAnnotations[0]?.name,
                        // text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                        brand: resultNew?.logoAnnotations[0]?.description,
                        landName: resultNew?.landmarkAnnotations[0]?.description,
                        qrcode: value.result
                    }
                ]
                console.log(imgDetails);
                res.send(imgDetails);

            }
            catch (error) {
                const imgDetails = [
                    {
                        object: resultNew?.localizedObjectAnnotations[0]?.name,
                        // text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                        brand: resultNew?.logoAnnotations[0]?.description,
                        landName: resultNew?.landmarkAnnotations[0]?.description,
                        qrcode: 'unstable/blurry/invalid QR, cant read'
                    }
                ]
                console.log(imgDetails);
                res.send(imgDetails);
            }

        }
        //bar reader........................
        else if (resultNew?.localizedObjectAnnotations[0]?.name == '1D barcode') {
            const buffer = Buffer.from(path_img, "base64");
            fs.writeFileSync("bartemp.jpg", buffer);
            var filePath = 'bartemp.jpg';
            // library for bar code reader named ZXING(same code diye qr code o read hoy lol)
            try {
                const jpegData = fs.readFileSync('bartemp.jpg');
                const rawImageData = jpeg.decode(jpegData);

                const hints = new Map();
                const formats = [BarcodeFormat.DATA_MATRIX];

                hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
                hints.set(DecodeHintType.TRY_HARDER, true);

                const reader = new MultiFormatReader();

                reader.setHints(hints);

                const len = rawImageData.width * rawImageData.height;

                const luminancesUint8Array = new Uint8Array(len);

                for (let i = 0; i < len; i++) {
                    luminancesUint8Array[i] = ((rawImageData.data[i * 4] + rawImageData.data[i * 4 + 1] * 2 + rawImageData.data[i * 4 + 2]) / 4) & 0xFF;
                }

                const luminanceSource = new RGBLuminanceSource(luminancesUint8Array, rawImageData.width, rawImageData.height);

                // console.log(luminanceSource);

                const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

                const decoded = reader.decode(binaryBitmap);

                console.log(decoded.text);

                const imgDetails = [
                    {
                        object: resultNew?.localizedObjectAnnotations[0]?.name,
                        // text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                        brand: resultNew?.logoAnnotations[0]?.description,
                        landName: resultNew?.landmarkAnnotations[0]?.description,
                        barcode: decoded.text
                    }
                ]
                console.log(imgDetails);
                res.send(imgDetails);

            }
            catch (err) {
                const imgDetails = [
                    {
                        object: resultNew?.localizedObjectAnnotations[0]?.name,
                        // text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                        brand: resultNew?.logoAnnotations[0]?.description,
                        landName: resultNew?.landmarkAnnotations[0]?.description,
                        barcode: 'unstable/blurry/invalid Bar, cant read'
                    }
                ]
                console.log(imgDetails);
                res.send(imgDetails);
            }

            //another library for bar code reader named javascriptBarcodeReader
            // const buffer = Buffer.from(path_img, "base64");
            // fs.writeFileSync("qrtemp.jpg", buffer);
            // var filePath = 'qrtemp.jpg';

            // javascriptBarcodeReader({
            //     /* Image file Path || {data: Uint8ClampedArray, width, height} || HTML5 Canvas ImageData */
            //     image: filePath,
            //     barcode: 'code-39',
            //     barcodeType: 'industrial',
            //     options: {
            //         useAdaptiveThreshold: true, // for images with sahded portions
            //         singlePass: true
            //     }
            // })
            //     .then(code => {
            //         console.log(code);
            //         const imgDetails = [
            //             {
            //                 object: resultNew?.localizedObjectAnnotations[0]?.name,
            //                 text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
            //                 brand: resultNew?.logoAnnotations[0]?.description,
            //                 landName: resultNew?.landmarkAnnotations[0]?.description,
            //                 barcode: code
            //             }
            //         ]
            //         console.log(imgDetails);
            //         res.send(imgDetails);

            //     })
            //     .catch(err => {
            //         console.log(err);
            //         const imgDetails = [
            //             {
            //                 object: resultNew?.localizedObjectAnnotations[0]?.name,
            //                 text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
            //                 brand: resultNew?.logoAnnotations[0]?.description,
            //                 landName: resultNew?.landmarkAnnotations[0]?.description,
            //                 barcode: 'unstable/blurry, cant read'
            //             }
            //         ]
            //         console.log(imgDetails);
            //         res.send(imgDetails);
            //     })

            //another library for bar code reader named Quagga
            // Quagga.decodeSingle({
            //     src: "qrtemp.jpg",
            //     numOfWorkers: 0,  // Needs to be 0 when used within node
            //     locate: true,
            //     inputStream: {
            //         size: 800  // restrict input-size to be 800px in width (long-side)
            //     },
            //     decoder: {
            //         readers: ["code_39_reader"] // List of active readers
            //     },
            // }, function (result) {
            //     if (result?.codeResult) {
            //         console.log("result", result.codeResult.code);
            //         const imgDetails = [
            //             {
            //                 object: resultNew?.localizedObjectAnnotations[0]?.name,
            //                 text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
            //                 brand: resultNew?.logoAnnotations[0]?.description,
            //                 landName: resultNew?.landmarkAnnotations[0]?.description,
            //                 barcode: result.codeResult.code
            //             }
            //         ]
            //         console.log(imgDetails);
            //         res.send(imgDetails);

            //     } else {
            //         console.log("not detected");
            //         const imgDetails = [
            //             {
            //                 object: resultNew?.localizedObjectAnnotations[0]?.name,
            //                 text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
            //                 brand: resultNew?.logoAnnotations[0]?.description,
            //                 landName: resultNew?.landmarkAnnotations[0]?.description,
            //                 barcode: "not detected"
            //             }
            //         ]
            //         console.log(imgDetails);
            //         res.send(imgDetails);
            //     }
            // });

        }
        // kinda onno kono object name hoile, image search or text reader
        else {

            const projectId = CREDENTIALS.project_id;
            const location = `${process.env.VISION_LOCATION}`;
            const productSetId = `${process.env.PROD_SET_ID}`;
            const productCategory = 'packagedgoods-v1';

            const filter = '';
            const productSetPath = productClient.productSetPath(
                projectId,
                location,
                productSetId
            );

            const request = {

                image: { content: path_img },
                features: [{ type: 'PRODUCT_SEARCH' }],
                imageContext: {
                    productSearchParams: {
                        productSet: productSetPath,
                        productCategories: [productCategory],
                        filter: filter,
                    },
                },
            };
            const [response] = await client.batchAnnotateImages({
                requests: [request],
            });
            console.log('Searching b64 Image');
            console.log(response['responses'][0]['productSearchResults']);
            // console.log()
            var imgSearchScore = 0;
            try {
                imgSearchScore = response['responses'][0]['productSearchResults']['results'][0]['score'];
            }
            catch (e) {
                imgSearchScore = 0;
            }



            console.log(imgSearchScore);

            // if (response['responses'][0]['productSearchResults'] || (response['responses'][0]['productSearchResults']['results'][0]['score']) < 0.4) {
            if (imgSearchScore < 0.6) {
                //only text read and return
                console.log("product result 0.6 er niche or khali")

                const imgDetails = [
                    {
                        object: resultNew?.localizedObjectAnnotations[0]?.name,
                        text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                        brand: resultNew?.logoAnnotations[0]?.description,
                        landName: resultNew?.landmarkAnnotations[0]?.description,

                    }
                ]
                console.log(imgDetails);
                res.send(imgDetails);
            }
            else {
                //image search and return productName & id
                console.log("product paise")

                const searchResultsImg = response['responses'][0]['productSearchResults']['results'];
                const imgDetails = [
                    {
                        object: resultNew?.localizedObjectAnnotations[0]?.name,
                        text: (resultNew?.fullTextAnnotation?.text)?.replace("\n", " "),
                        brand: resultNew?.logoAnnotations[0]?.description,
                        landName: resultNew?.landmarkAnnotations[0]?.description,
                        productId: searchResultsImg[0]['product'].name.split('/').pop(-1),
                        productName: searchResultsImg[0]['product'].displayName,
                        resImgName: `${searchResultsImg[0]['image'].split('/').pop(-1)}.jpg`,
                        imgLink: `https://storage.googleapis.com/${process.env.BUCKET_NAME}/${searchResultsImg[0]['image'].split('/').pop(-1)}.jpg`,
                        score: imgSearchScore,
                        searchedImg: path_img
                    }
                ]
                console.log(imgDetails);
                res.send(imgDetails);
            }

        }

    }

    detailsOfImg(img_path);
});



app.post('/createProduct', (req, res) => {

    const refImgArray = req.body.picArray;
    const prodName = req.body.prodName;
    const prodId = req.body.prodId;
    // console.log("array");
    // console.log(refImgArray);
    // console.log("prodName");
    // console.log(prodName);
    // console.log("prodId");
    // console.log(prodId);

    const createImgSearchProduct = async (refImgArray, prodName, prodId) => {

        try {

            const projectId = CREDENTIALS.project_id;
            const location = `${process.env.VISION_LOCATION}`;
            const productCategory = 'packagedgoods-v1'; //...........,,, shob product Catagory amra eki rakhbo
            const productSetId = `${process.env.PROD_SET_ID}`;
            const productId = prodId;
            const productDisplayName = prodName;
            const myBucket = gcs.bucket(`${process.env.BUCKET_NAME}`);

            /////////Creating a product,,,, ..........................................................!!!!!!!!!!!

            const locationPath = productClient.locationPath(projectId, location);
            const product = {
                displayName: productDisplayName,
                productCategory: productCategory,
            };
            const prodNewRequest = {
                parent: locationPath,
                product: product,
                productId: productId,
            };
            const [createdProduct] = await productClient.createProduct(prodNewRequest);
            console.log(`Product created, name: ${createdProduct.name}`);

            // Adding that product to the product set(highlights_1996)............................... !!!!!!!!!!!
            const productPath = productClient.productPath(projectId, location, productId);
            const productSetPath = productClient.productSetPath(
                projectId,
                location,
                productSetId
            );
            const prodToProdsetRequest = {
                name: productSetPath,
                product: productPath,
            };
            await productClient.addProductToProductSet(prodToProdsetRequest);
            console.log('Product added to product set.');


            for (let i = 0; i < refImgArray.length; i++) {

                //uploading image to google storage bucket...............................................!!!!!!!!!!!!!!!!!!!!!

                var bufferStream = new stream.PassThrough();
                // var b64Img = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                var b64Img = refImgArray[i];
                bufferStream.end(Buffer.from(b64Img, 'base64'));

                var file = myBucket.file(`${productId}_${i + 1}.jpg`);
                //Pipe the 'bufferStream' into a 'file.createWriteStream' method.
                bufferStream.pipe(file.createWriteStream({
                    metadata: {
                        contentType: 'image/jpeg',
                        metadata: {
                            custom: 'metadata'
                        }
                    },
                    public: true,
                    validation: "md5"
                }))
                    .on('error', function (err) {
                        console.log(err);
                        res.send({ mssg: err });
                    })
                    .on('finish', async function () {
                        // The file upload is complete.
                        console.log(`file uploaded- ${productId}_${i + 1}.jpg`);

                        //adding images of that product(that type of product should be already in a product set), which is called Reference image -_- !!!!!!!!!!!!!!!!!!!!!!!!!!!

                        const referenceImageId = `${productId}_${i + 1}`;
                        const gcsUri = `gs://${process.env.BUCKET_NAME}/${productId}_${i + 1}.jpg`; //eikhane ekta kaaj korte hobe,, nodejs e image upload dite hobe google cloud bucket e, then upload houar por response pathabe gscUri of that image
                        const formattedParent = productClient.productPath(projectId, location, productId);

                        const referenceImage = {
                            uri: gcsUri,
                        };
                        const refImgCreateRequest = {
                            parent: formattedParent,
                            referenceImage: referenceImage,
                            referenceImageId: referenceImageId,
                        };
                        const [response] = await productClient.createReferenceImage(refImgCreateRequest);
                        console.log(`response.name: ${response.name}`);
                        console.log(`response.uri: ${response.uri}`);
                        console.log(`successfully added all image as reference image`);

                    });


            }
            res.send({ mssg: "success" });


        }
        catch (err) {
            res.send({ mssg: err });
        }


    }

    // createImgSearchProduct(refImgArray, prodName, prodId);
    createImgSearchProduct(refImgArray, prodName, prodId);
})


app.get('/getAllProds', (req, res) => {



    listProductsInProductSet();
    //--------------Listing all products in a product set----------------
    async function listProductsInProductSet() {
        /**
         * TODO(developer): Uncomment the following line before running the sample.
         */
        const projectId = CREDENTIALS.project_id;
        const location = `${process.env.VISION_LOCATION}`;
        const productSetId = `${process.env.PROD_SET_ID}`;
        const productSetPath = productClient.productSetPath(
            projectId,
            location,
            productSetId
        );
        const getAllListReq = {
            name: productSetPath,
        };
        var allProdList = [];
        const [products] = await productClient.listProductsInProductSet(getAllListReq);
        products.forEach(product => {

            const singleProdDetails = {
                Pname: product.displayName,
                Pid: product.name.split('/').pop(-1)
            };
            allProdList.push(singleProdDetails);

        });
        res.send(allProdList);
    }

})

app.post('/savePhoto', (req, res) => {

    try {
        const img_path = req.body.pic;
        const token = req.body.token;
        // photo = img_path;

        const buffer = Buffer.from(img_path, "base64");
        fs.writeFileSync(`${token}.jpg`, buffer);
        // var filePath = 'tempPic1.jpg';
        const imgDetails = [
            {
                res: "success"
            }
        ]
        console.log(`image saved for ${token}`)
        res.send(imgDetails);
    }
    catch (e) {
        const imgDetails = [
            {
                res: `${e}`
            }
        ]
        console.log(`image couldn't saved for ${token}`)
        res.send(imgDetails);
    }


})

app.post('/getPhoto', (req, res) => {

    const img_name = req.body.picname;
    console.log(img_name);
    var fullImg_name = `${img_name}.jpg`;

    try {

        imageToBase64(fullImg_name) // Path to the image
            .then((response) => {


                const imgDetails = [
                    {
                        photob64: response
                    }
                ]

                res.send(imgDetails);
                // console.log(response); // "cGF0aC90by9maWxlLmpwZw=="
            }
            )
            .catch((error) => {
                // console.log(error); // Logs an error if there was one
                const imgDetails = [
                    {
                        photob64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
                    }]
                console.log(imgDetails.photob64);
                res.send(imgDetails);

            }
            )
    }
    catch (e) {

        const imgDetails = [
            {
                photob64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
            }]
        console.log(imgDetails.photob64);
        res.send(imgDetails);

    }





})

app.post('/removeFoundPic', (req, res) => {

    const img_name = req.body.picname;
    console.log(img_name);
    var fullImg_name = `${img_name}.jpg`;
    try {
        fs.unlinkSync(fullImg_name);
        console.log("image deleted");
    }
    catch (e) {

    }
})


app.get('/qr', (req, res) => {

    var Quaggar = require('quagga');

    Quaggar.decodeSingle({
        src: "rupom_bar39.jpg",
        locate: true,
        numOfWorkers: 0,  // Needs to be 0 when used within node
        inputStream: {
            size: 1000  // restrict input-size to be 800px in width (long-side)
        },
        frequency: 10,
        decoder: {
            readers: ["code_39_reader"] // List of active readers
        },
        debug: false,
    }, function (result) {
        if (result.codeResult) {
            console.log("result", result.codeResult.code);
        } else {
            console.log("not detected");
        }
    });



});




app.listen(port, () => {
    console.log(`listening on port`, port);
})
