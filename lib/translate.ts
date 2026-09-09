/**
 * Comprehensive Chinese-to-English Translation Engine
 * Translates Chinese commodity names, packaging, warehouses, marks, and logistics terms
 * strictly into clean English for database storage and export.
 */

export const CHINESE_TO_ENGLISH_DICTIONARY: Record<string, string> = {
  // ── Bags & Luggage ──
  '箱包': 'Bags & Luggage',
  '包袋': 'Bags & Pouches',
  '手袋': 'Handbags & Purses',
  '背包': 'Backpacks & School Bags',
  '双肩包': 'Backpacks',
  '单肩包': 'Shoulder & Crossbody Bags',
  '行李箱': 'Luggage & Suitcases',
  '拉杆箱': 'Trolley Suitcases & Luggage',
  '皮包': 'Leather Bags & Purses',
  '钱包': 'Wallets & Card Holders',
  '帆布袋': 'Canvas Totes & Bags',
  '购物袋': 'Shopping Bags',
  '收纳袋': 'Storage Bags & Organizers',
  '化妆包': 'Cosmetic & Toiletry Bags',
  '电脑包': 'Laptop Bags & Cases',
  '书包': 'School Bags',
  '腰包': 'Waist & Fanny Packs',

  // ── Footwear & Shoes ──
  '鞋子': 'Footwear & Shoes',
  '鞋靴': 'Shoes & Boots',
  '运动鞋': 'Sports & Athletic Shoes',
  '跑步鞋': 'Running Shoes',
  '皮鞋': 'Leather Shoes',
  '拖鞋': 'Slippers & Flip Flops',
  '凉鞋': 'Sandals & Slides',
  '靴子': 'Boots & Ankle Boots',
  '马丁靴': 'Combat & Ankle Boots',
  '帆布鞋': 'Canvas Sneakers',
  '休闲鞋': 'Casual Shoes & Sneakers',
  '童鞋': 'Kids & Children Shoes',
  '女鞋': 'Womens Shoes & Heels',
  '男鞋': 'Mens Shoes',
  '劳保鞋': 'Safety & Work Boots',
  '安全鞋': 'Safety Boots',
  '鞋底': 'Shoe Soles & Materials',
  '鞋材': 'Shoe Materials & Components',

  // ── Garments & Apparel ──
  '服装': 'Garments & Apparel',
  '衣服': 'Clothing & Apparel',
  '成衣': 'Ready-Made Garments',
  '女装': 'Womens Apparel',
  '男装': 'Mens Apparel',
  '童装': 'Kids & Childrens Wear',
  '婴儿服': 'Infant & Baby Wear',
  '连衣裙': 'Dresses & Gowns',
  '裙子': 'Skirts & Dresses',
  '半身裙': 'Skirts',
  '裤子': 'Trousers & Pants',
  '牛仔裤': 'Jeans & Denim Pants',
  '短裤': 'Shorts',
  '长裤': 'Long Pants & Trousers',
  '休闲裤': 'Casual Pants & Slacks',
  '运动裤': 'Sweatpants & Joggers',
  '上衣': 'Tops & Shirts',
  '衬衫': 'Shirts & Blouses',
  '短袖': 'Short-Sleeve T-Shirts',
  '长袖': 'Long-Sleeve Shirts',
  'T恤': 'T-Shirts',
  '圆领T恤': 'Crewneck T-Shirts',
  'POLO衫': 'Polo Shirts',
  '卫衣': 'Hoodies & Sweatshirts',
  '外套': 'Jackets & Outerwear',
  '风衣': 'Trench Coats & Windbreakers',
  '夹克': 'Jackets',
  '棉服': 'Padded Winter Coats',
  '羽绒服': 'Down Jackets & Winter Coats',
  '大衣': 'Overcoats & Coats',
  '毛衣': 'Sweaters & Knitwear',
  '针织衫': 'Knitwear & Cardigans',
  '内衣': 'Underwear & Lingerie',
  '文胸': 'Bras & Intimates',
  '内裤': 'Underpants & Briefs',
  '保暖内衣': 'Thermal Underwear',
  '睡衣': 'Sleepwear & Pajamas',
  '浴袍': 'Bathrobes',
  '袜子': 'Socks & Hosiery',
  '丝袜': 'Stockings & Tights',
  '泳装': 'Swimwear & Beachwear',
  '比基尼': 'Swimwear',
  '运动服': 'Activewear & Sportswear',
  '瑜伽服': 'Yoga & Fitness Wear',
  '工装': 'Workwear & Uniforms',

  // ── Textiles & Fabrics ──
  '面料': 'Textile Fabrics',
  '纺织品': 'Textiles & Fabrics',
  '布料': 'Fabrics & Cloth Materials',
  '棉布': 'Cotton Fabrics',
  '纯棉': 'Pure Cotton Materials',
  '涤纶': 'Polyester Fabrics',
  '雪纺': 'Chiffon Fabrics',
  '丝绸': 'Silk Fabrics & Textiles',
  '亚麻': 'Linen Fabrics',
  '针织面料': 'Knitted Fabrics',
  '无纺布': 'Non-Woven Fabrics',
  '窗帘': 'Window Curtains & Drapes',
  '床上用品': 'Bedding Sets & Linens',
  '床单': 'Bedsheets & Covers',
  '被套': 'Duvet Covers',
  '枕套': 'Pillowcases',
  '被子': 'Quilts & Comforters',
  '毯子': 'Blankets & Throws',
  '毛巾': 'Towels & Bath Linens',
  '浴巾': 'Bath Towels',
  '地毯': 'Carpets & Floor Rugs',
  '桌布': 'Tablecloths & Table Linens',
  '围巾': 'Scarves & Shawls',
  '帽子': 'Caps & Hats',
  '手套': 'Gloves & Mittens',

  // ── Electronics, Digital & Phones ──
  '电子配件': 'Electronic Accessories & Parts',
  '电子产品': 'Electronic Products & Devices',
  '数码产品': 'Digital Gadgets & Accessories',
  '电子': 'Electronics',
  '数码': 'Digital Electronics',
  '耳机': 'Headphones & Earbuds',
  '蓝牙耳机': 'Bluetooth Wireless Earbuds',
  '有线耳机': 'Wired Earphones',
  '音响': 'Speakers & Audio Systems',
  '音箱': 'Portable Bluetooth Speakers',
  '蓝牙音响': 'Bluetooth Speakers',
  '手机壳': 'Mobile Phone Cases & Covers',
  '手机保护套': 'Phone Cases & Covers',
  '钢化膜': 'Tempered Glass Screen Protectors',
  '保护膜': 'Screen Protective Films',
  '手机支架': 'Mobile Phone Holders & Stands',
  '充电器': 'Phone Chargers & Power Adapters',
  '快充头': 'Fast Chargers & Power Adapters',
  '无线充': 'Wireless Chargers',
  '数据线': 'Data Cables & USB Cords',
  '快充线': 'Fast Charging USB Cables',
  '充电宝': 'Power Banks & Portable Chargers',
  '移动电源': 'Power Banks & Battery Packs',
  '智能手表': 'Smart Watches & Fitness Bands',
  '智能手环': 'Fitness Trackers & Smart Bands',
  '手环': 'Smart Wristbands',
  '显示屏': 'Display Screens & LCDs',
  '液晶屏': 'LCD Panels & Displays',
  '电路板': 'PCB Circuit Boards',
  '主板': 'Mainboards & Motherboards',
  '电池': 'Batteries & Power Packs',
  '锂电池': 'Lithium Batteries',
  '遥控器': 'Remote Controls',
  '摄像头': 'Security Cameras & Webcams',
  '录音笔': 'Voice Recorders',
  '收音机': 'Radios',
  '麦克风': 'Microphones & Audio Recorders',
  '适配器': 'Power Adapters & Converters',
  '插头': 'Plugs & Connectors',
  '插座': 'Power Sockets & Outlets',
  '转换插头': 'Travel Plug Adapters',
  '排插': 'Power Strips & Extension Cords',
  '延长线': 'Extension Cords',

  // ── Lighting & Electrical ──
  '灯具': 'Lighting Fixtures & Lamps',
  '照明': 'Lighting & Illumination',
  'LED灯': 'LED Lights & Luminaires',
  'LED灯泡': 'LED Bulbs',
  'LED灯带': 'LED Strip Lights',
  '灯带': 'Light Strips',
  '灯条': 'LED Rigid Bar Lights',
  '射灯': 'Spotlights & Track Lights',
  '筒灯': 'Downlights & Recessed Lights',
  '吊灯': 'Pendant Lights & Chandeliers',
  '吸顶灯': 'Ceiling Flush Mount Lights',
  '台灯': 'Table & Desk Lamps',
  '落地灯': 'Floor Lamps',
  '壁灯': 'Wall Sconces & Lamps',
  '夜灯': 'Night Lights',
  '太阳能灯': 'Solar Powered Outdoor Lights',
  '户外灯': 'Outdoor Lighting Fixtures',
  '投光灯': 'Floodlights & Projectors',
  '工矿灯': 'High Bay Industrial Lights',
  '路灯': 'Street Lights & Luminaires',
  '灯管': 'Fluorescent & LED Tube Lights',
  '灯泡': 'Light Bulbs',
  '电线': 'Electric Wires & Cables',
  '电缆': 'Power & Signal Cables',
  '开关': 'Electrical Wall Switches',
  '感应开关': 'Sensor Switches',

  // ── Hardware, Tools & Fasteners ──
  '五金': 'Hardware Supplies',
  '五金工具': 'Hardware Tools & Kits',
  '五金配件': 'Hardware Parts & Fittings',
  '五金制品': 'Hardware Products & Supplies',
  '工具': 'Hand & Power Tools',
  '手工具': 'Hand Tools',
  '电动工具': 'Power Tools & Accessories',
  '螺丝': 'Screws & Fasteners',
  '自攻螺丝': 'Self-Tapping Screws',
  '螺栓': 'Bolts & Heavy Fasteners',
  '螺母': 'Hex Nuts & Washers',
  '垫片': 'Flat & Spring Washers',
  '紧固件': 'Fasteners & Industrial Bolts',
  '膨胀螺栓': 'Anchor Expansion Bolts',
  '轴承': 'Ball & Roller Bearings',
  '滚珠轴承': 'Ball Bearings',
  '锁具': 'Locks & Padlocks',
  '门锁': 'Door Locks & Hardware',
  '挂锁': 'Padlocks',
  '合页': 'Door & Cabinet Hinges',
  '铰链': 'Hinges & Pivot Hardware',
  '滑轨': 'Drawer Slide Rails',
  '拉手': 'Door & Drawer Pull Handles',
  '把手': 'Cabinet Handles & Knobs',
  '挂钩': 'Metal Hooks & Hangers',
  '水暖五金': 'Plumbing Hardware & Fittings',
  '水暖配件': 'Plumbing Fittings & Couplings',
  '水龙头': 'Water Faucets & Taps',
  '花洒': 'Shower Heads & Hand Showers',
  '花洒软管': 'Shower Hoses',
  '地漏': 'Floor Drains',
  '角阀': 'Angle Valves & Stops',
  '钳子': 'Pliers & Hand Grips',
  '扳手': 'Wrenches & Spanners',
  '螺丝刀': 'Screwdrivers',
  '卷尺': 'Tape Measures',
  '锤子': 'Hammers & Mallets',
  '锯条': 'Saw Blades',
  '钻头': 'Drill Bits',
  '切割片': 'Cutting & Grinding Discs',
  '砂纸': 'Sandpaper & Abrasives',
  '焊条': 'Welding Rods & Electrodes',

  // ── Machinery & Industrial Equipment ──
  '机械': 'Machinery & Equipment',
  '机械设备': 'Industrial Machinery & Equipment',
  '零部件': 'Mechanical Spare Parts',
  '配件': 'Spare Parts & Accessories',
  '电机': 'Electric Motors',
  '马达': 'Motors',
  '减速机': 'Gear Speed Reducers',
  '泵': 'Pumps & Fluid Equipment',
  '水泵': 'Water Pumps',
  '气泵': 'Air Pumps & Compressors',
  '压缩机': 'Air Compressors',
  '阀门': 'Valves & Flow Regulators',
  '球阀': 'Ball Valves',
  '蝶阀': 'Butterfly Valves',
  '发电机': 'Generators & Power Units',
  '工业配件': 'Industrial Supplies & Parts',
  '模具': 'Molds & Tooling',
  '传动带': 'Drive & Transmission Belts',
  '输送带': 'Conveyor Belts',
  '气缸': 'Pneumatic Air Cylinders',
  '液压配件': 'Hydraulic Fittings & Accessories',

  // ── Automotive, Motorcycle & Bike ──
  '汽车配件': 'Automotive Parts & Accessories',
  '汽配': 'Auto Replacement Parts',
  '汽车用品': 'Automotive Accessories & Goods',
  '车灯': 'Automotive Headlights & Lamps',
  '汽车坐垫': 'Car Seat Cushions & Covers',
  '刹车片': 'Brake Pads & Linings',
  '轮胎': 'Tires & Rubber Wheels',
  '雨刮器': 'Windshield Wiper Blades',
  '滤清器': 'Filters (Oil, Air, Fuel)',
  '减震器': 'Shock Absorbers & Struts',
  '火花塞': 'Spark Plugs',
  '方向盘套': 'Steering Wheel Covers',
  '倒车雷达': 'Parking Sensors',
  '行车记录仪': 'Car Dash Cameras',
  '汽车脚垫': 'Car Floor Mats',
  '摩托车配件': 'Motorcycle Parts & Accessories',
  '摩配': 'Motorcycle Parts',
  '摩托车头盔': 'Motorcycle Helmets',
  '电动车配件': 'Electric Scooter & Bike Parts',
  '自行车配件': 'Bicycle Parts & Accessories',
  '自行车': 'Bicycles & Bikes',

  // ── Toys & Children Goods ──
  '玩具': 'Toys & Games',
  '儿童玩具': 'Kids Toys & Playsets',
  '毛绒玩具': 'Plush & Stuffed Toys',
  '塑料玩具': 'Plastic Toy Sets',
  '益智玩具': 'Educational & Learning Toys',
  '积木': 'Building Blocks & Toy Sets',
  '拼图': 'Jigsaw Puzzles',
  '遥控车': 'RC Remote Control Cars',
  '遥控玩具': 'Remote Control Toys',
  '娃娃': 'Dolls & Playsets',
  '过家家玩具': 'Play Pretend & Kitchen Sets',
  '泡泡机': 'Bubble Blowers & Toys',
  '水枪': 'Toy Water Guns',
  '婴儿车': 'Baby Strollers & Prams',
  '学步车': 'Baby Walkers',
  '安全座椅': 'Child Safety Seats',
  '餐椅': 'Baby High Chairs',

  // ── Kitchenware, Dining & Household ──
  '厨具': 'Kitchenware & Utensils',
  '厨房用品': 'Kitchen Supplies & Utensils',
  '餐具': 'Tableware & Cutlery',
  '不锈钢餐具': 'Stainless Steel Flatware',
  '刀具': 'Kitchen Knives & Cutlery',
  '菜刀': 'Kitchen Chef Knives',
  '砧板': 'Cutting Boards & Chopping Blocks',
  '锅具': 'Pots, Pans & Cookware',
  '炒锅': 'Woks & Frying Pans',
  '汤锅': 'Soup Pots & Stockpots',
  '平底锅': 'Frying Pans & Skillets',
  '不粘锅': 'Non-Stick Pans',
  '陶瓷': 'Ceramic Dinnerware & Pottery',
  '陶瓷碗': 'Ceramic Bowls & Dishes',
  '陶瓷盘': 'Ceramic Plates',
  '玻璃器皿': 'Glassware & Glass Products',
  '玻璃杯': 'Glass Tumblers & Cups',
  '保温杯': 'Insulated Vacuum Flasks & Bottles',
  '水杯': 'Drinkware & Drinking Cups',
  '塑料杯': 'Plastic Cups & Tumblers',
  '咖啡杯': 'Coffee Mugs & Cups',
  '茶具': 'Tea Sets & Infusers',
  '开瓶器': 'Bottle Openers & Corkscrews',
  '保鲜盒': 'Food Storage Containers',
  '密封罐': 'Sealed Airtight Jars',

  // ── Furniture, Home Decor & Storage ──
  '家具': 'Furniture & Home Furnishings',
  '家居': 'Home Goods & Décor',
  '家居用品': 'Household Essentials & Goods',
  '桌子': 'Tables & Desks',
  '餐桌': 'Dining Tables',
  '电脑桌': 'Computer Desks',
  '椅子': 'Chairs & Seating',
  '办公椅': 'Office Ergonomic Chairs',
  '折叠椅': 'Folding Chairs',
  '沙发': 'Sofas & Couches',
  '床': 'Beds & Bed Frames',
  '衣柜': 'Wardrobes & Closets',
  '鞋柜': 'Shoe Storage Cabinets',
  '书架': 'Bookshelves & Display Shelves',
  '收纳盒': 'Storage Boxes & Organizers',
  '收纳箱': 'Storage Bins & Organizers',
  '整理箱': 'Organizer Storage Containers',
  '衣架': 'Clothes Hangers & Coat Racks',
  '晾衣架': 'Clothes Drying Racks',
  '镜子': 'Mirrors & Wall Glass',
  '相框': 'Photo & Picture Frames',
  '挂钟': 'Wall Clocks',
  '闹钟': 'Alarm Clocks',
  '装饰画': 'Decorative Canvas Wall Art',
  '花瓶': 'Decorative Vases',
  '仿真花': 'Artificial Flowers & Plants',
  '地垫': 'Floor Mats & Doormats',
  '窗贴': 'Window Film & Stickers',

  // ── Bathroom & Sanitary ──
  '卫浴': 'Sanitary Ware & Bathroom Goods',
  '卫浴配件': 'Bathroom Accessories & Fixtures',
  '卫浴五金': 'Bathroom Hardware & Fixtures',
  '水槽': 'Sinks & Basins',
  '台盆': 'Washbasins & Vanities',
  '马桶': 'Toilets & Commode Units',
  '智能马桶': 'Smart Bidets & Toilets',
  '毛巾架': 'Towel Bars & Racks',
  '纸巾盒': 'Tissue Box Holders',
  '肥皂盒': 'Soap Dishes & Dispensers',

  // ── Plastics, Rubber & Materials ──
  '塑料制品': 'Plastic Products & Goods',
  '塑料': 'Plastics & Moldings',
  '塑料盒': 'Plastic Containers & Boxes',
  '塑料桶': 'Plastic Buckets & Pails',
  '塑料袋': 'Plastic Bags & Polybags',
  '垃圾袋': 'Garbage & Trash Bags',
  '橡胶制品': 'Rubber Products & Moldings',
  '硅胶制品': 'Silicone Products & Goods',
  '海绵': 'Foam Sponges & Cushioning',

  // ── Stationery, Office & Paper ──
  '文具': 'Stationery & Writing Supplies',
  '学生文具': 'Student Stationery Supplies',
  '办公用品': 'Office Supplies & Accessories',
  '笔': 'Pens, Pencils & Markers',
  '中性笔': 'Gel Ink Pens',
  '圆珠笔': 'Ballpoint Pens',
  '记号笔': 'Permanent Markers & Highlighters',
  '铅笔': 'Pencils & Sharpeners',
  '笔记本': 'Notebooks & Paper Goods',
  '记事本': 'Notepads & Memo Books',
  '文件夹': 'File Folders & Document Binders',
  '文件袋': 'Document Pouches & Folders',
  '胶水': 'Adhesive Glues',
  '订书机': 'Staplers & Staples',
  '剪刀': 'Stationery & Craft Scissors',
  '美工刀': 'Utility Knives & Cutters',
  '纸制品': 'Paper Products & Packaging',
  '礼品盒': 'Gift Packaging Boxes',
  '纸盒': 'Paper & Cardboard Boxes',
  '包装盒': 'Packaging Boxes & Cartons',

  // ── Cosmetics & Personal Care ──
  '化妆品': 'Cosmetics & Beauty Products',
  '护肤品': 'Skincare Cosmetics & Lotions',
  '美容工具': 'Beauty & Makeup Tools',
  '化妆刷': 'Makeup Brushes & Applicators',
  '假睫毛': 'False Eyelashes',
  '美甲用品': 'Nail Art & Polish Supplies',
  '指甲油': 'Nail Polish',
  '指甲刀': 'Nail Clippers & Manicure Kits',
  '洗发水': 'Hair Care & Shampoos',
  '沐浴露': 'Body Wash & Shower Gel',
  '香水': 'Fragrances & Perfumes',
  '湿巾': 'Wet Wipes & Cleaning Tissues',
  '纸巾': 'Facial Tissues & Napkins',
  '牙刷': 'Toothbrushes & Dental Care',
  '电动牙刷': 'Electric Sonic Toothbrushes',
  '梳子': 'Hair Combs & Brushes',
  '剃须刀': 'Razors & Shaving Sets',

  // ── Sports, Fitness & Outdoors ──
  '体育用品': 'Sporting Goods & Equipment',
  '健身器材': 'Fitness Equipment & Accessories',
  '瑜伽垫': 'Yoga Mats',
  '跳绳': 'Jump Ropes',
  '哑铃': 'Dumbbells & Hand Weights',
  '篮球': 'Basketballs & Sports Balls',
  '足球': 'Soccer Balls & Footwear',
  '羽毛球拍': 'Badminton Rackets & Shuttles',
  '乒乓球拍': 'Table Tennis Paddles & Balls',
  '帐篷': 'Camping Tents & Shelters',
  '睡袋': 'Camping Sleeping Bags',
  '户外用品': 'Outdoor & Camping Supplies',
  '手电筒': 'Flashlights & Torches',
  '钓鱼具': 'Fishing Tackles & Rods',

  // ── Packaging & Packing Materials ──
  '包装材料': 'Packaging Materials',
  '胶带': 'Adhesive Packing Tapes',
  '封箱胶': 'Sealing Packing Tapes',
  '气泡膜': 'Bubble Wrap Protective Sheets',
  '缠绕膜': 'Stretch Cling Wrap Film',

  // ── General Merchandise & Commodities ──
  '日用品': 'Daily Household Necessities',
  '日用百货': 'Daily General Merchandise',
  '百货': 'General Merchandise',
  '杂货': 'Miscellaneous Goods & Sundries',
  '普通货物': 'General Cargo',
  '普货': 'General Cargo Merchandise',
  '小商品': 'Small Commodities & Merchandise',
  '工艺品': 'Arts, Crafts & Souvenirs',
  '礼品': 'Gifts & Promotional Items',
  '装饰品': 'Decorative Ornaments & Accessories',
  '样品': 'Commercial Product Samples',
};

// ── Compound Prefix/Modifier Tokens ──
export const CHINESE_MODIFIERS: [string, string][] = [
  ['不锈钢', 'Stainless Steel '],
  ['塑料', 'Plastic '],
  ['纯棉', 'Pure Cotton '],
  ['全棉', '100% Cotton '],
  ['皮革', 'Leather '],
  ['真皮', 'Genuine Leather '],
  ['木制', 'Wooden '],
  ['木质', 'Wooden '],
  ['铝合金', 'Aluminum '],
  ['金属', 'Metal '],
  ['陶瓷', 'Ceramic '],
  ['玻璃', 'Glass '],
  ['硅胶', 'Silicone '],
  ['橡胶', 'Rubber '],
  ['儿童', 'Kids '],
  ['婴儿', 'Baby '],
  ['男士', 'Mens '],
  ['女士', 'Womens '],
  ['智能', 'Smart '],
  ['无线', 'Wireless '],
  ['蓝牙', 'Bluetooth '],
  ['便携式', 'Portable '],
  ['折叠', 'Foldable '],
  ['户外', 'Outdoor '],
  ['家用', 'Household '],
  ['工业', 'Industrial '],
  ['汽车', 'Automotive '],
  ['防水', 'Waterproof '],
  ['充电', 'Rechargeable '],
  ['太阳能', 'Solar '],
  ['套装', ' Set'],
  ['配件', ' Parts & Accessories'],
];

// ── Packaging Translation Dictionary ──
export const PACKAGING_DICTIONARY: Record<string, string> = {
  '箱': 'Carton',
  '纸箱': 'Carton',
  '纸盒': 'Paper Box',
  '彩盒': 'Color Box',
  '木箱': 'Wooden Box',
  '木架': 'Wooden Crate',
  '木框': 'Wooden Frame',
  '木托': 'Wooden Pallet',
  '托盘': 'Pallet',
  '卡板': 'Pallet',
  '塑托': 'Plastic Pallet',
  '编织袋': 'Woven Bag',
  '麻袋': 'Gunny Bag',
  '布袋': 'Cloth Bag',
  '胶袋': 'Poly Bag',
  '塑料袋': 'Plastic Bag',
  '件': 'Pieces',
  '包': 'Package',
  '捆': 'Bundle',
  '扎': 'Bundle',
  '卷': 'Roll',
  '桶': 'Drum / Barrel',
  '铁桶': 'Steel Drum',
  '胶桶': 'Plastic Drum',
  '铁架': 'Steel Frame',
  '散货': 'Loose Cargo',
  '裸装': 'Bare / Unpacked',
};

// ── Warehouse Location Dictionary ──
export const WAREHOUSE_DICTIONARY: Record<string, string> = {
  '广州': 'Guangzhou Warehouse',
  '广州仓': 'Guangzhou Warehouse',
  '广州仓库': 'Guangzhou Warehouse',
  '白云仓': 'Guangzhou Baiyun Warehouse',
  '番禺仓': 'Guangzhou Panyu Warehouse',
  '花都仓': 'Guangzhou Huadu Warehouse',
  '义乌': 'Yiwu Warehouse',
  '义乌仓': 'Yiwu Warehouse',
  '义乌仓库': 'Yiwu Warehouse',
  '宁波': 'Ningbo Warehouse',
  '宁波仓': 'Ningbo Warehouse',
  '宁波仓库': 'Ningbo Warehouse',
  '深圳': 'Shenzhen Warehouse',
  '深圳仓': 'Shenzhen Warehouse',
  '深圳仓库': 'Shenzhen Warehouse',
  '宝安仓': 'Shenzhen Baoan Warehouse',
  '龙岗仓': 'Shenzhen Longgang Warehouse',
  '盐田仓': 'Shenzhen Yantian Warehouse',
  '佛山': 'Foshan Warehouse',
  '佛山仓': 'Foshan Warehouse',
  '顺德仓': 'Foshan Shunde Warehouse',
  '东莞': 'Dongguan Warehouse',
  '东莞仓': 'Dongguan Warehouse',
  '中山': 'Zhongshan Warehouse',
  '中山仓': 'Zhongshan Warehouse',
  '上海': 'Shanghai Warehouse',
  '上海仓': 'Shanghai Warehouse',
  '青岛': 'Qingdao Warehouse',
  '青岛仓': 'Qingdao Warehouse',
  '厦门': 'Xiamen Warehouse',
  '厦门仓': 'Xiamen Warehouse',
  '天津': 'Tianjin Warehouse',
  '天津仓': 'Tianjin Warehouse',
  '杭州': 'Hangzhou Warehouse',
  '杭州仓': 'Hangzhou Warehouse',
  '汕头': 'Shantou Warehouse',
  '汕头仓': 'Shantou Warehouse',
};

// ── Mark Dictionary ──
export const MARK_DICTIONARY: Record<string, string> = {
  '无唛': 'N/M (No Mark)',
  '无唛头': 'N/M (No Mark)',
  '无': 'N/M (No Mark)',
  '没有': 'N/M (No Mark)',
  '空白': 'N/M (No Mark)',
  '中性': 'Neutral Mark',
};

/**
 * Checks if a string contains any Chinese characters
 */
export function hasChineseCharacters(input?: string): boolean {
  if (!input) return false;
  return /[\u4e00-\u9fa5]/.test(input);
}

/**
 * Translates Chinese packaging term into clean English
 */
export function translatePackaging(input?: string): string {
  if (!input || !input.trim()) return 'Carton';
  const clean = input.trim();
  if (!hasChineseCharacters(clean)) return clean;

  if (PACKAGING_DICTIONARY[clean]) return PACKAGING_DICTIONARY[clean];

  for (const [cn, en] of Object.entries(PACKAGING_DICTIONARY)) {
    if (clean.includes(cn)) return en;
  }
  return 'Carton';
}

/**
 * Translates Chinese warehouse name into clean English
 */
export function translateWarehouse(input?: string): string {
  if (!input || !input.trim()) return 'China Warehouse';
  const clean = input.trim();
  if (!hasChineseCharacters(clean)) return clean;

  if (WAREHOUSE_DICTIONARY[clean]) return WAREHOUSE_DICTIONARY[clean];

  for (const [cn, en] of Object.entries(WAREHOUSE_DICTIONARY)) {
    if (clean.includes(cn)) return en;
  }
  return `${clean} (China Warehouse)`;
}

/**
 * Translates Chinese marks into clean English
 */
export function translateMark(input?: string): string {
  if (!input || !input.trim()) return '';
  const clean = input.trim();
  if (!hasChineseCharacters(clean)) return clean;

  if (MARK_DICTIONARY[clean]) return MARK_DICTIONARY[clean];
  for (const [cn, en] of Object.entries(MARK_DICTIONARY)) {
    if (clean.includes(cn)) return en;
  }
  return clean;
}

/**
 * Translates any input string (Chinese or mixed) into clean English.
 */
export function translateToEnglish(input?: string): string {
  if (!input || input.trim() === '' || input.trim() === 'N/A') {
    return 'General Merchandise';
  }

  // Strip leading/trailing artifacts
  const clean = input
    .trim()
    .replace(/^[\s?？\-_:：/／,，.]+|[\s?？\-_:：/／,，.]+$/g, '')
    .trim();

  if (!clean) {
    return 'General Merchandise';
  }

  // If already pure English/numbers/punctuation without Chinese characters
  if (!hasChineseCharacters(clean)) {
    return clean;
  }

  // 1. Direct dictionary match
  if (CHINESE_TO_ENGLISH_DICTIONARY[clean]) {
    return CHINESE_TO_ENGLISH_DICTIONARY[clean];
  }

  // 2. Exact match in dictionary sorted by length
  const sortedDictEntries = Object.entries(CHINESE_TO_ENGLISH_DICTIONARY).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [cn, en] of sortedDictEntries) {
    if (clean === cn) {
      return en;
    }
  }

  // 3. Check for modifier prefix + base noun (e.g., 不锈钢 + 螺丝 -> Stainless Steel Screws & Fasteners)
  let prefixPart = '';
  let remainder = clean;

  for (const [modCn, modEn] of CHINESE_MODIFIERS) {
    if (remainder.startsWith(modCn)) {
      prefixPart += modEn;
      remainder = remainder.slice(modCn.length).trim();
    }
  }

  if (prefixPart && remainder) {
    if (CHINESE_TO_ENGLISH_DICTIONARY[remainder]) {
      return (prefixPart + CHINESE_TO_ENGLISH_DICTIONARY[remainder]).trim();
    }
    for (const [cn, en] of sortedDictEntries) {
      if (remainder.includes(cn)) {
        return (prefixPart + en).trim();
      }
    }
  }

  // 4. Substring containment match in dictionary
  for (const [cn, en] of sortedDictEntries) {
    if (clean.includes(cn)) {
      return en;
    }
  }

  // 5. If mixed Chinese and English, strip the Chinese characters and preserve English
  const strippedOfChinese = clean
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/[\(\)（）]/g, '')
    .replace(/[\?？]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (strippedOfChinese.length > 1) {
    return strippedOfChinese.charAt(0).toUpperCase() + strippedOfChinese.slice(1);
  }

  return 'General Merchandise';
}

/**
 * Helper to produce both clean English and original Chinese
 */
export function translateCommodity(input?: string): { english: string; chinese: string } {
  if (!input || !input.trim()) {
    return { english: 'General Merchandise', chinese: '' };
  }
  const clean = input.trim();
  const isChinese = hasChineseCharacters(clean);
  const english = translateToEnglish(clean);

  return {
    english,
    chinese: isChinese ? clean : '',
  };
}
